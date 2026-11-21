// Customer shop: accounts, sections and age suggestions; the Customers page and shop settings
export const accounts: Record<string, string> = {
  // Sections
  Women: "السيدات",
  "Kids clothes": "ملابس الأطفال",
  "Kids accessories": "إكسسوارات الأطفال",
  "Comfy pieces for mums": "قطع مريحة للأمهات",
  "Soft basics and cute outfits for every day": "أساسيات ناعمة وأطقم لطيفة لكل يوم",
  Accessories: "الإكسسوارات",
  "Little extras that make every day easier": "إضافات صغيرة تسهّل كل يوم",
  "Only {{n}} left": "متبقٍ {{n}} فقط",
  "{{n}} left": "متبقٍ {{n}}",
  "Shop sections": "أقسام المتجر",
  "Picked for your baby": "مختارة لطفلك",
  "Fits now": "مقاسه الآن",
  "Next size": "المقاس التالي",

  // Baby's age
  "Your baby's age": "عمر طفلك",
  "How old is your baby?": "كم عمر طفلك؟",
  "We'll point out the sizes that fit now and the next size up. Age in months:":
    "سنوضح لك المقاسات المناسبة الآن والمقاس الأكبر التالي. العمر بالشهور:",
  "Not now": "ليس الآن",
  "Your baby is about {{n}} months old": "عمر طفلك حوالي {{n}} شهر",
  "Sizes that fit now and the next size up are marked for you.":
    "علّمنا لك المقاسات المناسبة الآن والمقاس التالي.",
  Change: "تغيير",

  // Header and closed shop
  "Light mode": "الوضع الفاتح",
  "Dark mode": "الوضع الداكن",
  "My account": "حسابي",
  "Our shop opens soon": "متجرنا يفتح قريبًا",
  "We're getting everything ready. Check back soon!": "نجهّز كل شيء الآن. تابعنا قريبًا!",
  "Team sign-in": "دخول الفريق",

  // Welcome and sign in
  "Welcome to Auriance": "أهلاً بك في أوريانس",
  "Sign in to see your orders and keep your details for next time, or just start shopping.":
    "سجّل الدخول لترى طلباتك وتحفظ بياناتك للمرة القادمة، أو ابدأ التسوق مباشرة.",
  "Continue as guest": "المتابعة كضيف",
  "Create an account": "إنشاء حساب",
  "Create account": "إنشاء الحساب",
  "Enter your phone number (or email) and password": "أدخل رقم الموبايل (أو البريد) وكلمة المرور",
  "Phone number or email": "رقم الموبايل أو البريد الإلكتروني",
  "Forgot password?": "نسيت كلمة المرور؟",
  "New here?": "جديد هنا؟",
  "Already have an account?": "لديك حساب بالفعل؟",
  "Welcome, {{name}}!": "أهلاً {{name}}!",
  "Keep your details for faster orders and see your order history.":
    "احفظ بياناتك لطلب أسرع وتابع سجل طلباتك.",
  "Your name": "اسمك",
  "Mobile number": "رقم الموبايل",
  "You'll sign in with this number.": "ستسجّل الدخول بهذا الرقم.",
  optional: "اختياري",
  "With a confirmed email you can reset your password yourself. Without one, message us on WhatsApp.":
    "مع بريد مؤكَّد يمكنك استعادة كلمة المرور بنفسك. بدونه، راسلنا على واتساب.",
  "At least 8 characters.": "8 أحرف على الأقل.",
  "Password must be at least 8 characters": "يجب ألا تقل كلمة المرور عن 8 أحرف",
  "Enter an Egyptian mobile number, like 01012345678": "أدخل رقم موبايل مصري، مثل 01012345678",
  "We sent a link to your email. Open it to confirm your address.":
    "أرسلنا رابطًا إلى بريدك. افتحه لتأكيد عنوانك.",

  // Forgot and reset
  "Forgot your password?": "نسيت كلمة المرور؟",
  "Hi, I forgot my Auriance password. My account phone number is: ":
    "مرحبًا، نسيت كلمة مرور حسابي في أوريانس. رقم الموبايل المسجّل: ",
  "If that email is confirmed on an account, a reset link is on its way. Check your inbox (and spam).":
    "إذا كان هذا البريد مؤكَّدًا على حساب، فرابط الاستعادة في الطريق. راجع صندوق الوارد (والرسائل غير المرغوبة).",
  "Your confirmed email": "بريدك المؤكَّد",
  "Email me a reset link": "أرسل لي رابط الاستعادة",
  "No email on your account? Message us on WhatsApp and we'll send you a link to choose a new password.":
    "لا يوجد بريد على حسابك؟ راسلنا على واتساب وسنرسل لك رابطًا لاختيار كلمة مرور جديدة.",
  "Message us on WhatsApp and we'll send you a link to choose a new password.":
    "راسلنا على واتساب وسنرسل لك رابطًا لاختيار كلمة مرور جديدة.",
  "Message us on WhatsApp": "راسلنا على واتساب",
  "Contact us on our WhatsApp number.": "تواصل معنا على رقم الواتساب.",
  "Back to sign in": "العودة لتسجيل الدخول",
  "Link not working": "الرابط لا يعمل",
  "Get a new link": "احصل على رابط جديد",
  "Password changed. You're signed in.": "تم تغيير كلمة المرور وتسجيل دخولك.",
  "Choose a new password": "اختر كلمة مرور جديدة",
  "For {{name}}'s account": "لحساب {{name}}",
  "Email confirmed": "تم تأكيد البريد",
  "We'll use it if you ever need to reset your password.": "سنستخدمه إذا احتجت يومًا لاستعادة كلمة المرور.",
  "Go to the shop": "الذهاب إلى المتجر",

  // Account
  "Hi {{name}}!": "أهلاً {{name}}!",
  Saved: "تم الحفظ",
  "My details": "بياناتي",
  "Alternative number or landline": "رقم بديل أو أرضي",
  "For the courier, in case the mobile signal is weak where you are": "لشركة الشحن، في حال كانت شبكة الموبايل ضعيفة عندك",
  Confirmed: "مؤكَّد",
  "Not confirmed": "غير مؤكَّد",
  "Send the confirmation link again": "إرسال رابط التأكيد مرة أخرى",
  "City / area": "المدينة / المنطقة",
  "Street, building, floor, apartment, landmark": "الشارع، العمارة، الدور، الشقة، علامة مميزة",
  "Save details": "حفظ البيانات",
  "My orders": "طلباتي",
  "No orders yet. Orders you place while signed in show up here.":
    "لا توجد طلبات بعد. الطلبات التي تضعها وأنت مسجّل الدخول تظهر هنا.",
  "Total with shipping": "الإجمالي مع الشحن",
  "Password changed": "تم تغيير كلمة المرور",

  // Team side: Customers page
  Customers: "العملاء",
  "People with a shop account. A customer who forgot their password and has no email can get a reset link from here on WhatsApp.":
    "أصحاب الحسابات على المتجر. العميل الذي نسي كلمة المرور وليس لديه بريد يمكنه الحصول على رابط استعادة من هنا عبر واتساب.",
  "Search name, phone or email": "ابحث بالاسم أو الرقم أو البريد",
  "No customers match your search": "لا يوجد عملاء مطابقون لبحثك",
  "No customer accounts yet": "لا توجد حسابات عملاء بعد",
  "Accounts appear here when customers sign up on the shop.": "تظهر الحسابات هنا عندما يسجّل العملاء في المتجر.",
  Address: "العنوان",
  Joined: "تاريخ التسجيل",
  "Password reset link": "رابط استعادة كلمة المرور",
  "Reset link for {{name}}": "رابط الاستعادة لـ {{name}}",
  "Send it on WhatsApp. It works once, for 2 days. Making a new link stops the old one.":
    "أرسله على واتساب. يعمل مرة واحدة لمدة يومين. إنشاء رابط جديد يوقف القديم.",
  Copied: "تم النسخ",
  "Couldn't copy. Select the link and copy it.": "تعذّر النسخ. حدّد الرابط وانسخه.",
  "Copy message": "نسخ الرسالة",
  "Send on WhatsApp": "إرسال على واتساب",
  "Hi {{name}}, here's your link to choose a new password for your Auriance account: {{url}}":
    "مرحبًا {{name}}، هذا رابط اختيار كلمة مرور جديدة لحسابك في أوريانس: {{url}}",

  // Team side: products and settings
  "Shop section": "قسم المتجر",
  "Not in the shop": "غير معروض في المتجر",
  "Where customers find it on the website. Products not in the shop stay hidden there.":
    "مكان ظهوره للعملاء على الموقع. المنتجات غير المعروضة تبقى مخفية هناك.",
  "{{n}} products moved to {{section}}": "تم نقل {{n}} منتج إلى {{section}}",
  "{{n}} products taken out of the shop": "تم إخفاء {{n}} منتج من المتجر",
  "Tick products, choose a section and apply. Products not in the shop stay hidden on the website.":
    "حدّد المنتجات واختر القسم ثم طبّق. المنتجات غير المعروضة تبقى مخفية على الموقع.",
  "All active": "كل المنتجات النشطة",
  "Select all shown ({{n}})": "تحديد كل المعروض ({{n}})",
  "Every active product is in a shop section.": "كل المنتجات النشطة في أقسام المتجر.",
  "Move to": "نقل إلى",
  "Apply to {{n}} products": "تطبيق على {{n}} منتج",
  "Shop settings saved": "تم حفظ إعدادات المتجر",
  "Customer shop": "متجر العملاء",
  "While the shop is closed only your team can open it (signed in). Open it when you're ready to launch.":
    "طالما المتجر مغلق، يفتحه فريقك فقط (بعد تسجيل الدخول). افتحه عندما تكون جاهزًا للإطلاق.",
  "Open the shop to the public": "فتح المتجر للجميع",
  "Anyone with the link can browse, sign up and shop.": "أي شخص لديه الرابط يمكنه التصفح والتسجيل والشراء.",
  "Business WhatsApp number": "رقم واتساب النشاط",
  "Customers message this number, for example when they forget their password.":
    "يراسل العملاء هذا الرقم، مثلًا عند نسيان كلمة المرور.",
  "Open the shop": "فتح المتجر",
  "Business details, formatting, the customer shop, backups and the deletion audit trail.":
    "بيانات النشاط والتنسيق ومتجر العملاء والنسخ الاحتياطية وسجل الحذف.",
  "Use an Egyptian mobile (11 digits: 010, 011, 012 or 015) or a landline with its area code (10 digits, like 0238221076)":
    "استخدم موبايل مصري (11 رقم: 010 أو 011 أو 012 أو 015) أو رقم أرضي بكود المحافظة (10 أرقام، مثل 0238221076)",
};
