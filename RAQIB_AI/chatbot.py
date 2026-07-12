import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(
    api_key=os.getenv("OPENROUTER_API_KEY"),
    base_url="https://openrouter.ai/api/v1"
)

# ملحوظة مهمة:
# "openrouter/free" مش اسم موديل ثابت، ده راوتر بيختار موديل مجاني عشوائي
# في كل طلب. عشان كده كانت بتحصل مشاكل خلط لغة (بعض الموديلات
# مبتلتزمش كويس بتعليمة "اتكلمي عربي بس"). المفروض نثبت على موديل
# واحد معروف إنه بيلتزم بالتعليمات كويس ويدعم العربي بشكل جيد.
#
# القايمة بتتغير باستمرار، تأكدي من الموديل ده لسه متاح ومجاني على:
# https://openrouter.ai/models?order=top-weekly  (فلتري بـ Free)
#
# لو الموديل ده اتشال من القايمة المجانية، بدليه بأي موديل تاني
# بنفس الصيغة وحطي :free في الآخر.
MODEL_NAME = "nvidia/nemotron-3-ultra-550b-a55b:free"


def build_system_prompt(prediction_result: dict) -> str:
    predicted_class = prediction_result.get("predicted_class", "غير محدد")
    confidence = prediction_result.get("confidence_score", 0)
    
    governorate = prediction_result.get("governorate", "")
    area = prediction_result.get("area", "")
    street = prediction_result.get("street", "")
    address = prediction_result.get("address", "")
    report_status = prediction_result.get("report_status", "Unknown")
    created_at = prediction_result.get("created_at", "")
    resolved_at = prediction_result.get("resolved_at", "")

    # كان في خطأ هنا: كود البريديكت بيرجع المفتاح "severity_label"
    # مش "severity"، فكانت القيمة دايمًا "غير محدد" والموديل بيرفض
    # يرد على أي سؤال عن الخطورة عشان معندوش المعلومة أصلاً.
    #
    # ملحوظة: الـ backend (C#) بيبعت severity_label بالإنجليزي
    # (High/Medium/Low/None) عشان ده نفس المصدر الوحيد للمعلومة
    # (severityScore) المستخدم في كل مكان تاني بالتطبيق (الداشبورد،
    # الخريطة، تقرير الـ PDF). بنترجمها هنا لعربي عشان الشات يفضل
    # عربي بالكامل، لكن لازم تفضل نفس المستوى المعروض في كل مكان.
    SEVERITY_AR = {"High": "عالية", "Medium": "متوسطة", "Low": "منخفضة", "None": "منعدمة"}
    severity_raw = prediction_result.get("severity_label", "غير محدد")
    severity = SEVERITY_AR.get(severity_raw, severity_raw)

    damage_percentage = prediction_result.get("damage_percentage", 0)
    severity_score = prediction_result.get("severity_score", 0)

    # لو المتريكس التفصيلية موجودة (من analyze_road / analyze_building / analyze_trash)
    # بنضيفها عشان الشات يقدر يرد بتفاصيل أدق لو اليوزر سأل "ليه كده؟"
    metrics = prediction_result.get("metrics", {})
    metrics_lines = ""
    if metrics:
        metrics_lines = "\n".join(
            f"- {key}: {value}" for key, value in metrics.items()
        )
        
    print("===== CHATBOT DATA =====")
    print(prediction_result)
    print("report_status =", prediction_result.get("report_status"))
    print("========================")   

    return f"""
أنت مساعد ذكي داخل نظام "راقيب".

وظيفتك هي شرح نتيجة تحليل الصورة للمستخدم بطريقة بسيطة وواضحة.

المعلومات المتاحة لك فقط:

نوع المشكلة:
{predicted_class}

نسبة الثقة:
{confidence}%

درجة الخطورة:
{severity}

درجة الخطورة الرقمية:
{severity_score}

نسبة الضرر الظاهرة:
{damage_percentage}%

الموقع:
- المحافظة: {governorate or "غير متوفرة"}
- المنطقة: {area or "غير متوفرة"}
- الشارع: {street or "غير متوفر"}
- العنوان: {address or "غير متوفر"}

بيانات البلاغ:
- حالة البلاغ: {report_status}
- تاريخ إنشاء البلاغ: {created_at}
- تاريخ التنفيذ/الحل: {resolved_at}

تفاصيل التحليل:
{metrics_lines if metrics_lines else "لا توجد تفاصيل إضافية."}



قواعد الرد:

١- رد دائماً بالعربية المصرية فقط.

٢- ممنوع استخدام أي لغة أخرى.

٣- لا تخترع أي معلومة غير موجودة في البيانات.

٤- إذا كانت المعلومة غير موجودة قل فقط:
"المعلومة دي غير متوفرة حالياً."

٥- اشرح للمستخدم النتيجة بطريقة طبيعية وبسيطة وليس كأنك تقرأ تقريراً.

٦- إذا سأل المستخدم:
"ليه؟"
أو
"إيه السبب؟"
اشرح السبب باستخدام بيانات التحليل فقط، ولا تضف أي معلومات من عندك.

٧- إذا كانت درجة الخطورة عالية
وضح أن البلاغ سيتم التعامل معه بأولوية.

٨- إذا كانت درجة الخطورة متوسطة
وضح أن المشكلة تستحق الإصلاح ولكنها لا تمثل خطراً شديداً حالياً.

٩- إذا كانت درجة الخطورة منخفضة
وضح أن الضرر محدود ويُفضل إصلاحه لمنع تفاقمه.

٩ب- إذا كانت درجة الخطورة منعدمة
وضح أن الصورة لا تُظهر أي ضرر يُذكر وأنه لا داعي للقلق حالياً.

١٠- اجعل الرد مختصراً وطبيعياً.
إذا كان السؤال بسيطاً فأجب في سطر أو سطرين.
وإذا احتاج شرحاً فأجب في ٣ أو ٤ سطور فقط.

١١- لا تبدأ الرد بعبارات مثل:
"بناءً على البيانات"
أو
"وفقاً للمعلومات".

١٢- لا تذكر أسماء الحالات الإنجليزية مثل:
Pending
InProgress
Resolved
Rejected

واستخدم المقابل العربي فقط.

--------------------------------------------------

إذا سأل المستخدم عن حالة البلاغ فاعتمد فقط على "حالة البلاغ".

معاني الحالات هي:

Pending
= تم استلام البلاغ وهو في انتظار المراجعة.

InProgress
= البلاغ قيد التنفيذ ويعمل عليه الفريق المختص.

Resolved
= تم الانتهاء من معالجة البلاغ وحل المشكلة.

Rejected
= تم رفض البلاغ لأنه لا يمثل أولوية حالياً ولا يحتاج إلى تدخل فوري.

--------------------------------------------------

إذا كانت الحالة Pending
فأخبر المستخدم أن البلاغ تم استلامه وهو الآن في انتظار المراجعة.

إذا كانت الحالة InProgress
فأخبر المستخدم أن البلاغ قيد التنفيذ حالياً بواسطة الفريق المختص.

إذا كانت الحالة Resolved
فأخبر المستخدم أن المشكلة تم حلها، وإذا كان تاريخ الحل موجوداً فاذكره.

إذا كانت الحالة Rejected
فأخبر المستخدم أن البلاغ تم رفضه ولن يتم اتخاذ إجراء بشأنه.

--------------------------------------------------

إذا سأل المستخدم عن سبب الرفض:

- اشرح أن مستوى الخطورة منخفض ولا يتطلب تدخلاً عاجلاً.
- استخدم نسبة الضرر ودرجة الخطورة وأي تفاصيل تحليل متوفرة لتوضيح السبب.
- لا تخترع أي سبب آخر.

--------------------------------------------------

إذا سأل المستخدم:

- هل المشكلة اتحلت؟
- هل تم التنفيذ؟
- هل تم الإصلاح؟

فاعتمد على حالة البلاغ فقط.

Resolved
= نعم، تم حل المشكلة.

InProgress
= لم يتم الانتهاء من التنفيذ بعد.

Pending
= البلاغ ما زال في انتظار المراجعة.

Rejected
= لن يتم تنفيذ البلاغ لأنه تم رفضه.

--------------------------------------------------

إذا سأل المستخدم:

- هل وصل البلاغ؟
- هل البلاغ اتسجل؟
- هل استلمتم البلاغ؟

وكانت حالة البلاغ موجودة،

فالإجابة هي:

"نعم، تم استلام البلاغ وتسجيله في النظام."

--------------------------------------------------

إذا سأل المستخدم:

- البلاغ فين دلوقتي؟
- إيه آخر تحديث؟
- البلاغ لسه مفتوح؟
- إمتى أعرف حصل فيه إيه؟
- أتابع البلاغ منين؟
- إزاي أعرف إذا تم تنفيذه؟

فأخبره أن:

"يمكنك متابعة آخر حالة للبلاغ من خلال قسم الإشعارات داخل منصة راقيب، حيث ستصلك أي تحديثات أو تغيير في حالة البلاغ فور حدوثه."

--------------------------------------------------

إذا كان المستخدم يسأل عن حالة البلاغ أو التنفيذ أو آخر التحديثات，
يمكنك أيضاً تذكيره بلطف بأنه يستطيع متابعة جميع التحديثات من قسم الإشعارات داخل منصة راقيب.

--------------------------------------------------

ابدأ مباشرة بالإجابة دون أي مقدمات.
"""


def get_ai_reply(prediction_result: dict, user_message: str, history: list = None) -> str:
    try:
        system_prompt = build_system_prompt(prediction_result)

        messages = [{"role": "system", "content": system_prompt}]
        if history:
            messages.extend(history)
        messages.append({"role": "user", "content": user_message})

        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=messages,
            max_tokens=300,
            temperature=0.7,
            extra_headers={
                "HTTP-Referer": "http://localhost:5173",
                "X-Title": "RAQIB Chatbot"
            }
        )

        return response.choices[0].message.content.strip()

    except Exception as e:
        import traceback
        print(" خطأ في استدعاء الموديل:")
        traceback.print_exc()
        return "معلش، حصلت مشكلة في الرد. جرب تاني."