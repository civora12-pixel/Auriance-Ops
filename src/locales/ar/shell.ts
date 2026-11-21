// Arabic for the app shell, auth pages, shared components and shared labels.
// Keys are the English text exactly as written in t("…").
export const shell: Record<string, string> = {
  // Navigation and layout
  Dashboard: "لوحة التحكم",
  Orders: "الطلبات",
  Products: "المنتجات",
  Inventory: "المخزون",
  Finance: "المالية",
  Team: "الفريق",
  Settings: "الإعدادات",
  "Manage fields": "إدارة الحقول",
  Operations: "العمليات",
  Main: "الرئيسية",
  Admin: "مسؤول",
  Member: "عضو",
  "Enter Admin Mode": "تفعيل وضع المسؤول",
  "Exit Admin Mode": "إنهاء وضع المسؤول",
  "Account menu": "قائمة الحساب",
  "Change password": "تغيير كلمة المرور",
  Theme: "المظهر",
  Light: "فاتح",
  Dark: "داكن",
  System: "النظام",
  Language: "اللغة",
  "Switch language to {{language}}": "تغيير اللغة إلى {{language}}",
  "Sign out": "تسجيل الخروج",
  "Admin Mode is on. Permanent deletes are unlocked.":
    "وضع المسؤول مفعّل. الحذف النهائي متاح.",
  "({{time}} left)": "(متبقٍ {{time}})",
  Exit: "إنهاء",
  Loading: "جارٍ التحميل",
  "Skip to content": "انتقل إلى المحتوى",
  Navigation: "التنقل",
  "Go to a section": "انتقل إلى قسم",
  "Open navigation": "فتح قائمة التنقل",
  "You don't have access to this section. Ask an admin if you need it.":
    "ليست لديك صلاحية الوصول إلى هذا القسم. اطلبها من المسؤول إذا احتجت إليها.",
  "Only admins can open this page.": "هذه الصفحة متاحة للمسؤولين فقط.",
  "Waiting for access": "في انتظار الصلاحية",
  "You're signed in as {{email}}, but an admin hasn't given you access to any section yet. Ask them to update your permissions on the Team page.":
    "سجّلت الدخول باسم {{email}}، لكن المسؤول لم يمنحك صلاحية الوصول إلى أي قسم بعد. اطلب منه تحديث صلاحياتك من صفحة الفريق.",
  "Check again": "التحقق مجددًا",
  Breadcrumb: "مسار التنقل",
  More: "المزيد",
  Close: "إغلاق",

  // States
  "Not found": "غير موجود",
  "It may have been deleted, or the link is wrong.":
    "ربما حُذف، أو أن الرابط غير صحيح.",
  "Go to dashboard": "الذهاب إلى لوحة التحكم",
  "No access": "لا توجد صلاحية",
  "You don't have access to this page. Ask an admin if you need it.":
    "ليست لديك صلاحية الوصول إلى هذه الصفحة. اطلبها من المسؤول إذا احتجت إليها.",
  "Go home": "الصفحة الرئيسية",
  "Something went wrong": "حدث خطأ ما",
  Retry: "إعادة المحاولة",
  "Page not found": "الصفحة غير موجودة",
  "The page you're looking for doesn't exist or has moved.":
    "الصفحة التي تبحث عنها غير موجودة أو نُقلت.",

  // Server errors
  "Something went wrong. Try again.": "حدث خطأ ما. حاول مرة أخرى.",
  "Can't reach the server. Check your connection and try again.":
    "تعذّر الوصول إلى الخادم. تحقق من اتصالك وحاول مرة أخرى.",
  "The server responded with {{status}}. Try again.":
    "استجاب الخادم بالرمز {{status}}. حاول مرة أخرى.",

  // Notifications
  Notifications: "الإشعارات",
  "Notifications, {{unread}} unread": "الإشعارات، {{unread}} غير مقروءة",
  "Mark all read": "تحديد الكل كمقروء",
  "You're all caught up": "لا توجد إشعارات جديدة",
  Unread: "غير مقروء",

  // Tables and paging
  "No results": "لا توجد نتائج",
  "Showing {{from}}–{{to}} of {{total}}": "عرض {{from}}–{{to}} من {{total}}",
  "Rows per page": "عدد الصفوف في الصفحة",
  "{{size}} / page": "{{size}} / صفحة",
  "Previous page": "الصفحة السابقة",
  "Next page": "الصفحة التالية",

  // Dialogs
  Cancel: "إلغاء",
  Confirm: "تأكيد",
  "Mark as paid": "تحديد كمدفوع",
  "Enter the date the payment arrived": "أدخل تاريخ وصول الدفعة",
  "The payment date can't be in the future":
    "لا يمكن أن يكون تاريخ الدفع في المستقبل",
  "Paid on": "تاريخ الدفع",
  "Payment method": "طريقة الدفع",
  "Not specified": "غير محدد",
  Paid: "مدفوع",
  Unpaid: "غير مدفوع",
  "Enter your password": "أدخل كلمة المرور",
  "Admin Mode is on for 15 minutes": "وضع المسؤول مفعّل لمدة 15 دقيقة",
  "Admin Mode unlocks permanent actions such as deleting orders, products, stock movements and expenses, editing field visibility and downloading backups. It turns off by itself after 15 minutes.":
    "يتيح وضع المسؤول الإجراءات النهائية مثل حذف الطلبات والمنتجات وحركات المخزون والمصروفات، وتعديل ظهور الحقول وتنزيل النسخ الاحتياطية. يتوقف تلقائيًا بعد 15 دقيقة.",
  "Your password": "كلمة المرور",
  "The password you sign in with.": "كلمة المرور التي تسجّل الدخول بها.",
  "Enter your current password": "أدخل كلمة المرور الحالية",
  "Use at least {{min}} characters": "استخدم {{min}} أحرف على الأقل",
  "Choose a different password": "اختر كلمة مرور مختلفة",
  "Passwords don't match": "كلمتا المرور غير متطابقتين",
  "Password changed. Other devices were signed out.":
    "تم تغيير كلمة المرور، وتم تسجيل الخروج من الأجهزة الأخرى.",
  "You'll stay signed in on this device.": "ستبقى مسجّل الدخول على هذا الجهاز.",
  "Current password": "كلمة المرور الحالية",
  "New password": "كلمة المرور الجديدة",
  "At least {{min}} characters.": "{{min}} أحرف على الأقل.",
  "Confirm new password": "تأكيد كلمة المرور الجديدة",

  // Product picker
  "Select a product…": "اختر منتجًا…",
  "Loading products…": "جارٍ تحميل المنتجات…",
  "{{quantity}} {{uom}} on hand": "المتوفر {{quantity}} {{uom}}",
  "{{quantity}} on hand": "المتوفر {{quantity}}",
  "Out of stock": "نفد المخزون",
  "Search by name or SKU…": "ابحث بالاسم أو رمز SKU…",
  "No products found.": "لا توجد منتجات.",
  "already added": "مضاف بالفعل",
  inactive: "غير نشط",

  // Form validation
  "Must be at least {{min}}": "يجب ألا يقل عن {{min}}",
  "Can't be more than {{max}}": "لا يمكن أن يزيد عن {{max}}",
  "Enter an amount": "أدخل مبلغًا",
  "Enter a valid number": "أدخل رقمًا صحيحًا",
  "Can't be negative": "لا يمكن أن يكون سالبًا",
  "That amount is too large": "المبلغ كبير جدًا",
  "Use at most 2 decimal places": "استخدم منزلتين عشريتين كحد أقصى",
  "Enter a quantity": "أدخل الكمية",
  "Use a whole number": "استخدم عددًا صحيحًا",

  // Auth pages
  "Sign in": "تسجيل الدخول",
  "Use the email and password your admin set up for you.":
    "استخدم البريد الإلكتروني وكلمة المرور اللذين أعدّهما لك المسؤول.",
  "Enter your email and password": "أدخل بريدك الإلكتروني وكلمة المرور",
  Email: "البريد الإلكتروني",
  Password: "كلمة المرور",
  "Forgot your password? Ask an admin for a reset link.":
    "نسيت كلمة المرور؟ اطلب رابط إعادة التعيين من المسؤول.",
  "Create the admin account": "إنشاء حساب المسؤول",
  "This is the owner account. You can invite your team once you're in.":
    "هذا حساب المالك. يمكنك دعوة فريقك بعد الدخول.",
  "Enter your name": "أدخل اسمك",
  "Enter a valid email": "أدخل بريدًا إلكترونيًا صحيحًا",
  "Your name": "اسمك",
  "Confirm password": "تأكيد كلمة المرور",
  "Create account": "إنشاء الحساب",
  "Checking your link…": "جارٍ التحقق من الرابط…",
  "Link not valid": "الرابط غير صالح",
  "Go to sign in": "الذهاب إلى تسجيل الدخول",
  "Join the team": "الانضمام إلى الفريق",
  "Set a new password": "تعيين كلمة مرور جديدة",
  "Choose a password for <b>{{email}}</b>":
    "اختر كلمة مرور للحساب <b>{{email}}</b>",
  "For <b>{{email}}</b>": "للحساب <b>{{email}}</b>",
  "Join and sign in": "الانضمام وتسجيل الدخول",
  "Save and sign in": "الحفظ وتسجيل الدخول",

  // Order statuses
  New: "جديد",
  "On hold": "معلّق",
  Shipped: "تم الشحن",
  "Partially returned": "مرتجع جزئيًا",
  Returned: "مرتجع",
  Swapped: "تم الاستبدال",
  Cancelled: "ملغى",

  // Stock movement types
  Restock: "توريد",
  Shipment: "شحنة",
  Return: "إرجاع",
  "Swap out": "استبدال (صادر)",
  "Swap in": "استبدال (وارد)",
  Adjustment: "تسوية",
  "Not sellable in": "وارد غير قابل للبيع",
  "Write-off": "شطب",
  "Back to sellable": "إعادة إلى قابل للبيع",

  // Restock types and adjust reasons
  Purchase: "شراء",
  "Manual adjustment": "تسوية يدوية",
  Lost: "مفقود",
  Damaged: "تالف",
  Expired: "منتهي الصلاحية",
  "Count correction": "تصحيح جرد",
  Found: "تم العثور عليه",
  Other: "أخرى",

  // Payment methods
  Cash: "نقدًا",
  "Bank transfer": "تحويل بنكي",
  Card: "بطاقة",

  // Expense categories
  Shipping: "الشحن",
  Packaging: "التغليف",
  Rent: "الإيجار",
  Salaries: "الرواتب",
  Marketing: "التسويق",
  Utilities: "المرافق",

  // Stock levels
  "Low stock": "مخزون منخفض",
  "In stock": "متوفر",

  // Field sections (Manage fields)
  "Fields shown on the product list and product form":
    "الحقول المعروضة في قائمة المنتجات ونموذج المنتج",
  "Product name": "اسم المنتج",
  SKU: "رمز SKU",
  Category: "الفئة",
  "Unit price": "سعر الوحدة",
  "Unit of measure": "وحدة القياس",
  Image: "الصورة",
  "Reorder threshold": "حد إعادة الطلب",
  Variants: "المتغيرات",
  "Columns shown on the stock table and its export":
    "الأعمدة المعروضة في جدول المخزون وملف تصديره",
  Product: "المنتج",
  "On hand": "المتوفر",
  "Avg cost": "متوسط التكلفة",
  "Asset value": "قيمة الأصول",
  "Reorder at": "إعادة الطلب عند",
  "Stock status": "حالة المخزون",
  "Columns shown on the orders list, the order form and the export":
    "الأعمدة المعروضة في قائمة الطلبات ونموذج الطلب وملف التصدير",
  "Order #": "رقم الطلب",
  "Shipment #": "رقم الشحنة",
  Date: "التاريخ",
  Customer: "العميل",
  "Customer phone": "هاتف العميل",
  "Items count": "عدد الأصناف",
  Total: "الإجمالي",
  Status: "الحالة",
  Payment: "الدفع",
  Notes: "ملاحظات",
  "Offer name": "اسم العرض",
  "Shipment notes": "ملاحظات الشحنة",
  "Tip: use | to search for several things at once, e.g. TEE-RED|TEE-BLK":
    "نصيحة: استخدم | للبحث عن عدة أشياء معًا، مثل TEE-RED|TEE-BLK",
  // Layout and permissions
  "Packing queue": "قائمة التجهيز",
  Movements: "الحركات",
  Adjustments: "التسويات",
  "Finance overview": "نظرة عامة على المالية",
  "Running costs such as rent, marketing and salaries.":
    "التكاليف الجارية مثل الإيجار والتسويق والرواتب.",
  "Sales, open orders and low-stock alerts":
    "المبيعات والطلبات المفتوحة وتنبيهات نقص المخزون",
  "Orders: create, edit, cancel, swap and re-record":
    "الطلبات: إنشاء وتعديل وإلغاء واستبدال وإعادة تسجيل",
  "Products, stock, packing queue, movements and adjustments":
    "المنتجات والمخزون وقائمة التجهيز والحركات والتسويات",
  "Profit and loss, expenses and reports":
    "الأرباح والخسائر والمصروفات والتقارير",
  "Custom access. Pick a preset or set each area below.":
    "صلاحيات مخصصة. اختر دورًا جاهزًا أو حدد كل قسم بالأسفل.",
  "Can ship orders and record returns": "يمكنه شحن الطلبات وتسجيل المرتجعات",
  "Needs Orders: Edit. Team settings stay with admins.":
    "يتطلب صلاحية تعديل الطلبات. إعدادات الفريق للمسؤولين فقط.",
  "can ship and record returns": "يمكنه الشحن وتسجيل المرتجعات",
  View: "عرض",
  Edit: "تعديل",
  Moderator: "مودريتور",
  "Warehouse lead": "مسؤول المخزن",
  "Creates and edits orders (cancel, swap, re-record). Views inventory. No shipping, returns or finance.":
    "ينشئ الطلبات ويعدلها (إلغاء، استبدال، إعادة تسجيل). يعرض المخزون. بدون شحن أو مرتجعات أو مالية.",
  "Runs the warehouse: products, stock, packing, shipping and returns. Views the dashboard and finance.":
    "يدير المخزن: المنتجات والمخزون والتجهيز والشحن والمرتجعات. يعرض لوحة التحكم والمالية.",
  "by you": "بواسطتك",
  "Name saved": "تم حفظ الاسم",
  "Shown on the orders they record and at the end of every WhatsApp post. Write it the way the group should see it, e.g. in Arabic.":
    "يظهر على الطلبات التي يسجلها وفي آخر كل رسالة واتساب. اكتبه كما يجب أن يراه الجروب، بالعربي مثلًا.",
  "e.g. هند": "مثال: هند",
  "Edit name": "تعديل الاسم",
  Save: "حفظ",
  "Back from zero after returns, not announced yet: {{count}} item(s), {{units}} unit(s)":
    "رجع من الصفر بعد المرتجعات ولم يُعلن بعد: {{count}} صنف، {{units}} قطعة",
  "(waiting {{minutes}} min)": "(منتظر منذ {{minutes}} دقيقة)",
  "Tell the moderators": "بلّغي المودريتورز",
  "Marked as announced": "تم التسجيل كمُعلن",
  "Message copied": "تم نسخ الرسالة",
  "Couldn't copy. Select the text and copy it yourself.": "تعذّر النسخ. حددي النص وانسخيه يدويًا.",
  "Tell the moderators what's back": "بلّغي المودريتورز باللي رجع",
  "Only items that had nothing to sell before these returns, with the units still free now. Edit the message if you like, then choose the group in WhatsApp; you can mention people there.":
    "الأصناف التي لم يكن منها شيء متاح للبيع قبل هذه المرتجعات فقط، بالقطع المتاحة الآن. عدّلي الرسالة لو حبيتي، ثم اختاري الجروب في واتساب؛ وتقدري تعملي منشن هناك.",
  "Cleared without sending": "تم المسح بدون إرسال",
  "Clear without sending": "مسح بدون إرسال",
  "Open WhatsApp": "فتح واتساب",
  Copy: "نسخ",
};
