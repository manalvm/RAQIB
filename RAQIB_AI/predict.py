
import os
from pathlib import Path

import tensorflow as tf
import numpy as np
import cv2
from PIL import Image
import time

# ===========================
# Configuration
# ===========================

IMG_SIZE = (260, 260)
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "uploads")
MODEL_PATH = os.path.join(os.path.dirname(__file__), "disaster_6class_model_final.keras")

CLASS_NAMES = [
    "Damaged Road",
    "Normal Road",
    "Damaged Home",
    "Normal Building",
    "Big Trash",
    "Small Trash"
]

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
print("Before loading model...")
model = tf.keras.models.load_model(MODEL_PATH)
print("Model loaded successfully!")

# ===========================
# Model warm-up
# ===========================
# tf.keras.models.load_model() only deserializes the weights - it does NOT
# build/trace the compute graph or finish XLA/cuDNN initialization. That
# happens lazily on the FIRST call to model.predict(), which is exactly why
# the first real prediction was taking 80+ seconds and blowing past the
# .NET HttpClient's 60s timeout. Running one dummy prediction here, at
# module import time (i.e. once, when the FastAPI process starts), pays
# that one-time cost during startup instead of during a user's request.
print("Warming up model...")
_warmup_start = time.time()
_warmup_input = np.zeros((1, IMG_SIZE[0], IMG_SIZE[1], 3), dtype="float32")
model.predict(_warmup_input, verbose=0)
print(f"Model warm-up complete in {time.time() - _warmup_start:.2f} seconds")


def resolve_path(image_path: str | os.PathLike) -> str:
    path = Path(image_path)
    if path.is_absolute():
        return str(path)
    candidate_paths = [
        path,
        Path(UPLOAD_FOLDER) / path,
        Path.cwd() / path,
        Path(os.path.dirname(__file__)) / path,
    ]
    for candidate in candidate_paths:
        if candidate.exists():
            return str(candidate)
    return str(Path(UPLOAD_FOLDER) / path)

# ===========================
# Image Preprocessing
# ===========================

def preprocess_image(image_path):

    resolved_path = resolve_path(image_path)
    image = Image.open(resolved_path).convert("RGB")
    image = image.resize(IMG_SIZE)
    image = np.array(image).astype("float32")

    # Same preprocessing used during training
    image = tf.keras.applications.efficientnet.preprocess_input(image)

    image = np.expand_dims(image, axis=0)

    return image


# ===========================
# Road Analysis
# ===========================

def analyze_road(image_path):

    image = cv2.imread(image_path)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    blur = cv2.GaussianBlur(gray, (5, 5), 0)

    # Detect edges
    edges = cv2.Canny(blur, 60, 170)

    # Connect nearby cracks
    kernel = np.ones((3,3), np.uint8)
    edges = cv2.dilate(edges, kernel, iterations=1)

    # Find damaged regions
    contours, _ = cv2.findContours(
        edges,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE
    )

    total_area = 0
    largest_pothole = 0
    crack_length = 0
    crack_count = 0

    for cnt in contours:

        area = cv2.contourArea(cnt)

        # Ignore tiny noise
        if area < 30:
            continue

        crack_count += 1

        total_area += area

        largest_pothole = max(largest_pothole, area)

        crack_length += cv2.arcLength(cnt, False)

    image_area = image.shape[0] * image.shape[1]

    damage_percentage = (total_area / image_area) * 100

    pothole_percentage = (largest_pothole / image_area) * 100

    crack_density = crack_length / image_area

    # Texture roughness
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    texture = laplacian.var()

    # Normalize each feature
    damage_score = min(damage_percentage * 4, 100)

    pothole_score = min(pothole_percentage * 10, 100)

    crack_score = min(crack_density * 6000, 100)

    texture_score = min(texture / 15, 100)

    count_score = min(crack_count * 3, 100)

    # Final severity
    severity_score = (
        0.35 * damage_score +
        0.25 * pothole_score +
        0.20 * crack_score +
        0.10 * texture_score +
        0.10 * count_score
    )

    return {
        "damage_percentage": round(damage_percentage, 2),
        "largest_pothole_percentage": round(pothole_percentage, 2),
        "crack_length": round(crack_length, 2),
        "crack_count": crack_count,
        "texture_score": round(texture, 2),
        "severity_score": round(min(severity_score, 100), 2)
    }


# ===========================
# Building Analysis
# ===========================

def analyze_building(image_path):

    image = cv2.imread(image_path)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    blur = cv2.GaussianBlur(gray, (5,5), 0)

    # Detect possible damaged regions
    _, mask = cv2.threshold(
        blur,
        0,
        255,
        cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
    )

    kernel = np.ones((3,3), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)

    contours, _ = cv2.findContours(
        mask,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE
    )

    total_area = 0
    largest_region = 0
    contour_complexity = 0
    region_count = 0

    for cnt in contours:

        area = cv2.contourArea(cnt)

        if area < 50:
            continue

        region_count += 1

        total_area += area

        largest_region = max(largest_region, area)

        perimeter = cv2.arcLength(cnt, True)

        if area > 0:
            contour_complexity += (perimeter ** 2) / (4 * np.pi * area)

    image_area = image.shape[0] * image.shape[1]

    damage_percentage = (total_area / image_area) * 100

    largest_damage_percentage = (largest_region / image_area) * 100

    # Texture roughness
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    texture = laplacian.var()

    # Brightness (collapsed buildings tend to be darker)
    brightness = np.mean(gray)

    # -------------------------
    # Normalize features
    # -------------------------

    damage_score = min(damage_percentage * 3, 100)

    largest_score = min(largest_damage_percentage * 8, 100)

    texture_score = min(texture / 20, 100)

    complexity_score = min(contour_complexity * 5, 100)

    brightness_score = max(0, (150 - brightness) / 150 * 100)

    # -------------------------
    # Final severity score
    # -------------------------

    severity_score = (
        0.40 * damage_score +
        0.20 * largest_score +
        0.20 * texture_score +
        0.10 * complexity_score +
        0.10 * brightness_score
    )

    return {
        "damage_percentage": round(damage_percentage, 2),
        "largest_damage_percentage": round(largest_damage_percentage, 2),
        "damaged_regions": region_count,
        "texture_score": round(texture, 2),
        "contour_complexity": round(contour_complexity, 2),
        "brightness": round(brightness, 2),
        "severity_score": round(min(severity_score, 100), 2)
    }


# ===========================
# Trash Analysis
# ===========================

def analyze_trash(image_path):

    image = cv2.imread(image_path)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    blur = cv2.GaussianBlur(gray, (5,5), 0)

    # Automatic threshold
    _, mask = cv2.threshold(
        blur,
        0,
        255,
        cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
    )

    kernel = np.ones((5,5), np.uint8)

    mask = cv2.morphologyEx(
        mask,
        cv2.MORPH_OPEN,
        kernel
    )

    mask = cv2.morphologyEx(
        mask,
        cv2.MORPH_CLOSE,
        kernel
    )

    contours, _ = cv2.findContours(
        mask,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE
    )

    total_area = 0
    largest_object = 0
    object_count = 0

    for cnt in contours:

        area = cv2.contourArea(cnt)

        if area < 40:
            continue

        object_count += 1

        total_area += area

        largest_object = max(largest_object, area)

    image_area = image.shape[0] * image.shape[1]

    debris_percentage = (total_area / image_area) * 100

    largest_object_percentage = (largest_object / image_area) * 100

    if object_count > 0:
        average_size = total_area / object_count
    else:
        average_size = 0

    # -------------------------
    # Normalize features
    # -------------------------

    debris_score = min(debris_percentage * 4, 100)

    largest_score = min(largest_object_percentage * 8, 100)

    object_score = min(object_count * 5, 100)

    average_score = min(average_size / 300, 100)

    # -------------------------
    # Final severity score
    # -------------------------

    severity_score = (
        0.45 * debris_score +
        0.25 * largest_score +
        0.20 * object_score +
        0.10 * average_score
    )

    return {
        "debris_percentage": round(debris_percentage, 2),
        "largest_object_percentage": round(largest_object_percentage, 2),
        "object_count": object_count,
        "average_object_size": round(average_size, 2),
        "severity_score": round(min(severity_score, 100), 2)
    }


# ===========================
# Prediction
# ===========================

def predict_image(image_path):
    start = time.time()

    resolved_path = resolve_path(image_path)
    image = preprocess_image(resolved_path)

    probabilities = model.predict(image, verbose=0)[0]

    print(f"Prediction took {time.time() - start:.2f} seconds")


    predicted_index = np.argmax(probabilities)

    predicted_class = CLASS_NAMES[predicted_index]

    confidence = float(probabilities[predicted_index])

    # -----------------------
    # Dynamic Severity
    # -----------------------

    # -----------------------
    # Class-aware severity ranges
    # -----------------------
    # analyze_road/analyze_building/analyze_trash measure how much of the
    # *image* looks damaged/cluttered using generic edge/contour heuristics.
    # Those heuristics don't know what the classifier decided, so on their
    # own they can (and did) produce contradictions like "Small Trash"
    # scoring 99% - a genuinely minor issue reading as critical.
    #
    # Instead of clamping the raw score with a fixed floor/cap, each
    # predicted_class owns a valid severity *range*. The raw 0-100 CV score
    # is linearly rescaled into that range, so the image analysis still
    # fully determines where exactly the report lands - a barely-cluttered
    # "Small Trash" image lands near the bottom of its range, a heavily
    # cluttered one near the top - but the range itself guarantees the
    # final percentage can never contradict what the predicted_class means.
    # This is the single source of truth every other part of the app
    # (frontend, PDF, chatbot) derives its risk label from.
    SEVERITY_RANGES = {
        "Normal Road": (0, 10),
        "Normal Building": (0, 10),
        "Small Trash": (5, 35),
        "Big Trash": (40, 100),
        "Damaged Road": (40, 100),
        "Damaged Home": (40, 100),
    }

    def scale_to_range(raw_score: float, bounds: tuple[float, float]) -> float:
        """Linearly map a 0-100 raw CV score into the class's [min, max] range."""
        low, high = bounds
        raw = max(0.0, min(100.0, raw_score))
        return low + (raw / 100.0) * (high - low)

    if predicted_class == "Damaged Road":

        metrics = analyze_road(image_path)
        damage_percentage = metrics["damage_percentage"]
        raw_score = metrics["severity_score"]

    elif predicted_class == "Damaged Home":

        metrics = analyze_building(image_path)
        damage_percentage = metrics["damage_percentage"]
        raw_score = metrics["severity_score"]

    elif predicted_class == "Big Trash":

        metrics = analyze_trash(image_path)
        damage_percentage = metrics["debris_percentage"]
        raw_score = metrics["severity_score"]

    elif predicted_class == "Small Trash":

        metrics = analyze_trash(image_path)
        damage_percentage = metrics["debris_percentage"]
        raw_score = metrics["severity_score"]

    else:
        # Normal Road / Normal Building: nothing damaged to measure
        metrics = {}
        damage_percentage = 0
        raw_score = 0

    severity_score = scale_to_range(raw_score, SEVERITY_RANGES.get(predicted_class, (0, 100)))

    # Keep the metrics dict (shown as extra "تفاصيل التحليل" lines to the
    # chatbot/UI) in sync with the final, class-aware severity_score, so
    # nothing downstream ever sees two different severity numbers for the
    # same report.
    if metrics:
        metrics["severity_score"] = round(severity_score, 2)

    # Severity label
    # Four tiers, matching the Arabic levels shown throughout the app:
    # منعدمة (None) / منخفضة (Low) / متوسطة (Medium) / عالية (High)
    if severity_score <= 10:
        severity_label = "None"

    elif severity_score <= 40:
        severity_label = "Low"

    elif severity_score <= 70:
        severity_label = "Medium"

    else:
        severity_label = "High"

    return {

        "predicted_class": predicted_class,

        "confidence_score": round(confidence * 100, 2),

        "damage_percentage": round(damage_percentage, 2),

        "severity_score": round(severity_score, 2),

        "severity_label": severity_label,

        "metrics": metrics,

        "all_probabilities": {
            CLASS_NAMES[i]: round(float(probabilities[i]), 4)
            for i in range(len(CLASS_NAMES))
        }

    }