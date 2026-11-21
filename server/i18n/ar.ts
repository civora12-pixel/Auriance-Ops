// Arabic for the text the server sends: error messages, and the history notes,
// notifications, logs and import results it stores in English.
//
// Template placeholders: {x} translates the captured text as a label or message,
// {x~} keeps it as is (names, SKUs, numbers, user notes), {x*} translates each
// item of a ", " list and {x|} each item of an " or " list.
import {
  ADJUST_REASON_LABELS,
  EXPENSE_CATEGORY_LABELS,
  FIELD_SECTIONS,
  MOVEMENT_TYPE_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  RESTOCK_TYPE_LABELS,
  SECTION_LABELS,
} from "../../shared/constants.ts";
import type {
  AdjustReason,
  ExpenseCategory,
  FieldSection,
  MovementType,
  OrderStatus,
  PaymentMethod,
  RestockType,
  Section,
} from "../../shared/constants.ts";

/** Whole messages, matched exactly. */
export const MESSAGES: Record<string, string> = {
  // Server and API
  "This change conflicts with existing data. Refresh and try again.":
    "يتعارض هذا التغيير مع بيانات موجودة. حدّث الصفحة وحاول مرة أخرى.",
  "The server is busy. Try again in a moment.":
    "الخادم مشغول. حاول مرة أخرى بعد قليل.",
  "Something went wrong on the server. Try again.":
    "حدث خطأ في الخادم. حاول مرة أخرى.",
  "Cross-site request blocked": "تم حظر طلب من موقع آخر",
  "Request is too large": "الطلب كبير جدًا",
  "Unknown API call": "استدعاء غير معروف للواجهة البرمجية",
  "Unknown API route": "مسار غير معروف في الواجهة البرمجية",
  "Your session has ended. Sign in again.":
    "انتهت جلستك. سجّل الدخول مرة أخرى.",
  "Invalid request body": "محتوى الطلب غير صالح",
  "Invalid request": "طلب غير صالح",
  "Sign in again to continue": "سجّل الدخول مرة أخرى للمتابعة",
  "Only admins can download backups":
    "يمكن للمسؤولين فقط تنزيل النسخ الاحتياطية",
  "Turn on Admin Mode to download a backup":
    "فعّل وضع المسؤول لتنزيل نسخة احتياطية",

  // Sign-in and accounts
  "This workspace is already set up. Sign in instead.":
    "تم إعداد مساحة العمل هذه بالفعل. سجّل الدخول بدلًا من ذلك.",
  "Too many sign-in attempts. Wait 15 minutes and try again.":
    "محاولات تسجيل دخول كثيرة جدًا. انتظر 15 دقيقة وحاول مرة أخرى.",
  "Email or password is incorrect":
    "البريد الإلكتروني أو كلمة المرور غير صحيحة",
  "This account is deactivated. Ask an admin to reactivate it.":
    "هذا الحساب معطّل. اطلب من المسؤول إعادة تفعيله.",
  "Too many attempts. Wait 15 minutes.": "محاولات كثيرة جدًا. انتظر 15 دقيقة.",
  "Current password is incorrect": "كلمة المرور الحالية غير صحيحة",
  "This link is invalid or has expired. Ask an admin for a new one.":
    "هذا الرابط غير صالح أو منتهي الصلاحية. اطلب رابطًا جديدًا من المسؤول.",
  "Only admins can turn on Admin Mode": "يمكن للمسؤولين فقط تفعيل وضع المسؤول",
  "Incorrect password": "كلمة المرور غير صحيحة",
  "Password is too long": "كلمة المرور طويلة جدًا",
  "Enter a valid email address": "أدخل بريدًا إلكترونيًا صالحًا",
  "Enter your password": "أدخل كلمة المرور",
  "Enter your name": "أدخل اسمك",
  "Enter a name": "أدخل اسمًا",

  // Permissions
  "Only admins can do this": "يمكن للمسؤولين فقط القيام بذلك",
  "Turn on Admin Mode to do this. It asks for your password again.":
    "فعّل وضع المسؤول للقيام بذلك. سيطلب منك كلمة المرور مرة أخرى.",
  "You don't have permission to change order status. Ask an admin.":
    "ليست لديك صلاحية تغيير حالة الطلب. اطلب ذلك من المسؤول.",

  // Not found
  "Product not found": "المنتج غير موجود",
  "Variant not found": "المتغير غير موجود",
  "Order not found": "الطلب غير موجود",
  "Movement not found": "الحركة غير موجودة",
  "Expense not found": "المصروف غير موجود",
  "Notification not found": "الإشعار غير موجود",
  "User not found": "المستخدم غير موجود",
  "Unknown field": "حقل غير معروف",
  "Inventory record not found for this item": "لا يوجد سجل مخزون لهذا العنصر",
  "Line item not found on this order": "البند غير موجود في هذا الطلب",

  // Validation
  "Use the YYYY-MM-DD format": "استخدم الصيغة YYYY-MM-DD",
  "Enter a valid date": "أدخل تاريخًا صالحًا",
  "Enter valid dates": "أدخل تواريخ صالحة",
  "The start date must be on or before the end date":
    "يجب أن يكون تاريخ البداية في تاريخ النهاية أو قبله",
  "Pick a range of at most 5 years": "اختر فترة لا تزيد على 5 سنوات",
  "Amount can't be negative": "لا يمكن أن يكون المبلغ سالبًا",
  "Amount must be greater than 0": "يجب أن يكون المبلغ أكبر من 0",
  "Quantity must be a whole number": "يجب أن تكون الكمية عددًا صحيحًا",
  "Quantity must be greater than zero": "يجب أن تكون الكمية أكبر من صفر",
  "Quantity must be a whole number greater than zero":
    "يجب أن تكون الكمية عددًا صحيحًا أكبر من صفر",
  "SKU is required": "رمز SKU مطلوب",
  "SKU is too long": "رمز SKU طويل جدًا",
  "Name is required": "الاسم مطلوب",
  "Up to 20 attributes": "20 سمة كحد أقصى",
  "Image URL must start with http:// or https://":
    "يجب أن يبدأ رابط الصورة بـ http:// أو https://",
  "Category is required": "الفئة مطلوبة",
  "Unit of measure is required": "وحدة القياس مطلوبة",
  "Reorder threshold must be a whole number":
    "يجب أن يكون حد إعادة الطلب عددًا صحيحًا",
  "Reorder threshold can't be negative":
    "لا يمكن أن يكون حد إعادة الطلب سالبًا",
  "Unit cost can't be negative": "لا يمكن أن تكون تكلفة الوحدة سالبة",
  "This item has no cost yet. Enter the unit cost.":
    "لا توجد تكلفة لهذا الصنف بعد. أدخل تكلفة الوحدة.",
  "That reason doesn't fit this kind of adjustment":
    "هذا السبب لا يناسب هذا النوع من التسوية",
  "A reason is required": "السبب مطلوب",
  "Business name is required": "اسم النشاط التجاري مطلوب",
  "Description is required": "الوصف مطلوب",
  "Customer name is required": "اسم العميل مطلوب",
  "Shipment number is required": "رقم الشحنة مطلوب",
  "Add at least one product": "أضف منتجًا واحدًا على الأقل",
  "Select at least one item to return": "اختر عنصرًا واحدًا على الأقل لإرجاعه",
  "Select at least one order": "اختر طلبًا واحدًا على الأقل",
  "The file has no rows": "لا يحتوي الملف على أي صفوف",

  // Orders
  "Only new or on-hold orders can be shipped":
    "يمكن شحن الطلبات الجديدة أو المعلّقة فقط",
  "Each line can only be listed once": "يمكن إدراج كل بند مرة واحدة فقط",
  "This order has nothing left to ship": "لا يوجد في هذا الطلب ما يمكن شحنه",
  "You don't have permission to ship orders or record returns. Ask an admin.":
    "ليس لديك صلاحية شحن الطلبات أو تسجيل المرتجعات. اطلب ذلك من المسؤول.",
  "Address is required": "العنوان مطلوب",
  "Choose where the order came from": "اختر مصدر الطلب",
  "Only shipped orders can be posted to WhatsApp":
    "يمكن نشر الطلبات المشحونة فقط على واتساب",
  "Posted to WhatsApp": "تم النشر على واتساب",
  "Posted to WhatsApp again": "تم النشر على واتساب مرة أخرى",
  "The photo is too large. Use one under 15 MB.":
    "الصورة كبيرة جدًا. استخدم صورة أقل من 15 ميجابايت.",
  "That file isn't a photo the app can read. Use a JPG, PNG or WebP image.":
    "هذا الملف ليس صورة يمكن للتطبيق قراءتها. استخدم صورة JPG أو PNG أو WebP.",
  "Only new or on-hold orders can be cancelled. Shipped orders must be returned instead.":
    "يمكن إلغاء الطلبات الجديدة أو المعلّقة فقط. يجب إرجاع الطلبات المشحونة بدلًا من ذلك.",
  "Some items have already shipped. Return them instead of cancelling.":
    "تم شحن بعض العناصر بالفعل. أرجِعها بدلًا من إلغاء الطلب.",
  "This order is marked as paid. Refund the customer and mark it unpaid before cancelling.":
    "هذا الطلب مسجّل كمدفوع. ردّ المبلغ إلى العميل وسجّله كغير مدفوع قبل الإلغاء.",
  "Only new orders can be put on hold": "يمكن تعليق الطلبات الجديدة فقط",
  "Part of this order has shipped. Ship the rest to complete it.":
    "تم شحن جزء من هذا الطلب. اشحن الباقي لإكماله.",
  "Only cancelled or on-hold orders can be moved back to New":
    "يمكن إعادة الطلبات الملغاة أو المعلّقة فقط إلى «جديد»",
  "Only shipped orders can be returned": "يمكن إرجاع الطلبات المشحونة فقط",
  "The refund can't be more than the order's current total":
    "لا يمكن أن يتجاوز الاسترداد إجمالي الطلب الحالي",
  "This order has a custom total, so enter the refund amount for a partial return.":
    "لهذا الطلب إجمالي مخصص، لذا أدخل مبلغ الاسترداد للإرجاع الجزئي.",
  "Only shipped orders can be swapped":
    "يمكن الاستبدال في الطلبات المشحونة فقط",
  "This order has a custom total, so enter the refund for the swapped items.":
    "لهذا الطلب إجمالي مخصص، لذا أدخل مبلغ الاسترداد للعناصر المستبدلة.",
  "The refund can't be more than the order's current total plus the replacement":
    "لا يمكن أن يتجاوز الاسترداد إجمالي الطلب الحالي مضافًا إليه قيمة البديل",
  "Cancelled orders can't be marked as paid":
    "لا يمكن تسجيل الطلبات الملغاة كمدفوعة",

  // Team
  "Reactivate this teammate first": "أعد تفعيل عضو الفريق هذا أولًا",
  "Admins always have full access": "للمسؤولين صلاحية كاملة دائمًا",
  "You can't remove the last admin. Promote another teammate first.":
    "لا يمكنك إزالة آخر مسؤول. رقِّ عضوًا آخر في الفريق أولًا.",
  "You can't deactivate yourself": "لا يمكنك تعطيل حسابك",
  "You can't deactivate the last admin": "لا يمكنك تعطيل آخر مسؤول",

  // Imports
  "Missing a required value (name, uom)": "قيمة مطلوبة مفقودة (name، uom)",
  "Unit price must be a number, 0 or more":
    "يجب أن يكون سعر الوحدة رقمًا، 0 أو أكثر",
  "Reorder threshold must be a whole number, 0 or more":
    "يجب أن يكون حد إعادة الطلب عددًا صحيحًا، 0 أو أكثر",
  "A variant_sku needs a variant_name": "يحتاج variant_sku إلى variant_name",

  // Order history notes
  "Order created": "تم إنشاء الطلب",
  "Order reopened": "تمت إعادة فتح الطلب",
  "Enter the customer's phone": "أدخل رقم هاتف العميل",
  "Phone must be an 11-digit Egyptian mobile (010, 011, 012 or 015)":
    "يجب أن يكون الهاتف رقم موبايل مصري من 11 رقمًا (010 أو 011 أو 012 أو 015)",
  "Second phone must be an 11-digit Egyptian mobile (010, 011, 012 or 015)":
    "يجب أن يكون الهاتف الثاني رقم موبايل مصري من 11 رقمًا (010 أو 011 أو 012 أو 015)",
  "Only New orders can be shipped. On hold orders are waiting for stock.":
    "يمكن شحن الطلبات الجديدة فقط. الطلبات المعلّقة بانتظار المخزون.",
  "Only cancelled orders can be reopened": "يمكن إعادة فتح الطلبات الملغاة فقط",
  "Each order can only be listed once": "يمكن إدراج كل طلب مرة واحدة فقط",
  "Only restocks and opening stock can have their cost corrected":
    "يمكن تصحيح التكلفة لحركات التوريد والرصيد الافتتاحي فقط",
  "Enter the correct unit cost": "أدخل تكلفة الوحدة الصحيحة",
  "Choose at least one order": "اختر طلبًا واحدًا على الأقل",
  "A cost correction can't be deleted. Correct the cost again instead.":
    "لا يمكن حذف تصحيح التكلفة. صحّح التكلفة مرة أخرى بدلًا من ذلك.",
  "Cancelled orders can't be posted to WhatsApp":
    "لا يمكن نشر الطلبات الملغاة على واتساب",
  "Opening stock": "رصيد افتتاحي",
  "Only cancelled orders can be re-recorded":
    "يمكن إعادة تسجيل الطلبات الملغاة فقط",
  "Marked paid": "تم التسجيل كمدفوع",
  "Marked unpaid": "تم التسجيل كغير مدفوع",

  // Movement notes
  "Returned, not sellable": "مُرجع، غير قابل للبيع",
  "Swapped out, not sellable": "مُستبدل، غير قابل للبيع",

  // Deletion log
  "No stock record left to reverse": "لم يتبقَّ سجل مخزون لعكسه",
  "No stock movements to reverse": "لا توجد حركات مخزون لعكسها",
  None: "لا شيء",

  // Fallback names
  "Unknown product": "منتج غير معروف",
  "Unknown user": "مستخدم غير معروف",
  "No offer name": "بدون اسم عرض",
  // Ledger
  "An entry needs at least two lines": "القيد يحتاج إلى سطرين على الأقل",
  "Amounts can't be negative": "لا يمكن أن تكون المبالغ سالبة",
  "Each line needs either a debit or a credit amount": "كل سطر يحتاج إلى مبلغ مدين أو دائن فقط",
  "Account not found": "الحساب غير موجود",
  "Journal entry not found": "القيد غير موجود",
  "Only manual entries can be changed. Automatic entries follow the order or stock movement that made them.":
    "يمكن تعديل القيود اليدوية فقط. القيود التلقائية تتبع الطلب أو حركة المخزون التي أنشأتها.",
  "The app uses this account, so its type can't change": "يستخدم التطبيق هذا الحساب، لذا لا يمكن تغيير نوعه",
  "This account already has entries, so its type can't change": "هذا الحساب عليه قيود بالفعل، لذا لا يمكن تغيير نوعه",
  "The app uses this account, so it can't be deactivated": "يستخدم التطبيق هذا الحساب، لذا لا يمكن إيقافه",
  "Only accounts with a zero balance can be deactivated": "يمكن إيقاف الحسابات ذات الرصيد صفر فقط",
  "Use a whole number for the code": "استخدم رقمًا صحيحًا للكود",
  "Use a 5-digit code, e.g. 60008": "استخدم كودًا من 5 أرقام، مثل 60008",
  "Enter the account name": "أدخل اسم الحساب",
  "Enter the group": "أدخل المجموعة",
  "Enter a description": "أدخل وصفًا",
  "Choose the account the purchase was paid from": "اختر الحساب الذي دُفعت منه المشتريات",
  // Closing
  "A month can be closed once it has ended": "يمكن إقفال الشهر بعد انتهائه",
  "An account the app needs is missing from the chart": "حساب يحتاجه التطبيق غير موجود في الدليل",
  "Choose a month": "اختر شهرًا",
  "Choose a partner": "اختر شريكًا",
  "Close the earlier months first": "أقفل الشهور السابقة أولًا",
  "Post the opening balances first": "رحّل الأرصدة الافتتاحية أولًا",
  "Reopen the later closings first": "أعد فتح الإقفالات اللاحقة أولًا",
  "That date is in a closed month": "هذا التاريخ في شهر مُقفل",
  "The opening balances are already posted": "الأرصدة الافتتاحية مُرحَّلة بالفعل",
  "This month is already closed": "هذا الشهر مُقفل بالفعل",
  "This period is already closed": "هذه الفترة مُقفلة بالفعل",
  "Name each cost": "اكتب اسم كل تكلفة",
  "Enter the monthly amount": "أدخل المبلغ الشهري",
  "Choose a month or a day": "اختر شهرًا أو يومًا",
  "You can close up to today, not a day in the future": "يمكنك الإقفال حتى اليوم، وليس يومًا في المستقبل",
  "This period is closed. Reopen it to make changes.": "هذه الفترة مُقفلة. أعد فتحها للتعديل.",
  "This period isn't closed": "هذه الفترة ليست مُقفلة",
  "Enter an amount": "أدخل مبلغًا",
  // Courier settlements
  "Choose the account the money arrived in": "اختر الحساب الذي وصل إليه المبلغ",
  "No order with this shipment number": "لا يوجد طلب بهذا الرقم",
  "Left out of this settlement": "مستبعد من هذه التسوية",
  "Partly returned: choose the pieces that came back": "مرتجع جزئي: اختر القطع التي رجعت",
  "Choose the bank or cash account it's paid from": "اختر حساب البنك أو النقدية الذي يُدفع منه",
  "Posted as a full return: the courier's sheet says partial": "سُجّل كمرتجع كامل: كشف شركة الشحن يقول جزئي",
  "Enter the amount collected for the pieces the customer kept": "أدخل المبلغ المحصّل عن القطع التي احتفظ بها العميل",
  "The amount collected can't be more than the order total": "لا يمكن أن يزيد المبلغ المحصّل عن إجمالي الطلب",
  "Check the returned pieces": "راجع القطع المرتجعة",
  "This order has a custom total: enter the refund for the returned pieces": "هذا الطلب له إجمالي مخصص: أدخل مبلغ الاسترداد للقطع المرتجعة",
  "No rows are ready to post": "لا توجد صفوف جاهزة للترحيل",
  "No shipment number": "لا يوجد رقم شحنة",
  "Settlement not found": "التسوية غير موجودة",
  "This shipment is listed twice in the sheet": "هذه الشحنة مكررة في الشيت",
  "The sheet has no rows": "الشيت لا يحتوي على صفوف",
  "Upload at most 2,000 rows at a time": "ارفع 2000 صف كحد أقصى في المرة",
  "This order was paid through a courier settlement. Undo the settlement instead.":
    "تم دفع هذا الطلب عبر تسوية شركة الشحن. ألغِ التسوية بدلًا من ذلك.",
  "This entry has no due date": "هذا القيد ليس له تاريخ استحقاق",
  // Customer shop
  "Confirm this website order first: add its shipment number.": "أكّد طلب الموقع أولًا: أضف رقم الشحنة.",
  "Enter a valid ship date": "أدخل تاريخ شحن صحيحًا",
  "The ship date must be after today": "يجب أن يكون تاريخ الشحن بعد اليوم",
  "The ship date must be within a year": "يجب أن يكون تاريخ الشحن خلال سنة",
  "Only New or On hold orders can get a ship date": "يمكن تحديد موعد شحن للطلبات الجديدة أو المعلّقة فقط",
  "No longer delayed: ship as usual": "لم يعد مؤجَّلًا: يُشحن كالمعتاد",
  "Only shipped orders (not returned) can have their price corrected": "يمكن تصحيح السعر للطلبات المشحونة فقط (غير المرتجعة)",
  "Say why the price changed": "اذكر سبب تغيير السعر",
  "That's already the order's total": "هذا هو إجمالي الطلب بالفعل",
  "The total can't be negative": "لا يمكن أن يكون الإجمالي سالبًا",
  "This order is already paid: its price can't be corrected": "هذا الطلب مدفوع بالفعل: لا يمكن تصحيح سعره",
  "This order is already confirmed": "هذا الطلب مؤكَّد بالفعل",
  "This order is cancelled": "هذا الطلب ملغي",
  "Enter your delivery address": "أدخل عنوان التوصيل",
  "Your cart is empty": "سلتك فارغة",
  "Order placed on the website": "تم الطلب من الموقع",
  "Confirmed with the customer": "تم التأكيد مع العميل",
  "Choose at least one product": "اختر منتجًا واحدًا على الأقل",
  "Enter at least one shipment number": "أدخل رقم شحنة واحدًا على الأقل",
  "Choose your governorate from the list": "اختر محافظتك من القائمة",
  "Choose your city or area from the list": "اختر مدينتك أو منطقتك من القائمة",
  "You can add up to 6 children": "يمكنك إضافة 6 أطفال بحد أقصى",
  "Check the birthdays: they can't be in the future or more than 6 years ago":
    "راجع تواريخ الميلاد: لا يمكن أن تكون في المستقبل أو منذ أكثر من 6 سنوات",
  "Enter an Egyptian mobile number, like 01012345678": "أدخل رقم موبايل مصري، مثل 01012345678",
  "Phone must be an Egyptian mobile (11 digits: 010, 011, 012 or 015) or a landline with its area code (10 digits, like 0238221076)":
    "الهاتف يجب أن يكون موبايل مصري (11 رقم: 010 أو 011 أو 012 أو 015) أو أرضي بكود المحافظة (10 أرقام، مثل 0238221076)",
  "Second phone must be an Egyptian mobile (11 digits) or a landline with its area code (10 digits)":
    "الهاتف الثاني يجب أن يكون موبايل مصري (11 رقم) أو أرضي بكود المحافظة (10 أرقام)",
  "Customer not found": "العميل غير موجود",
  "The shop isn't open yet": "المتجر لم يُفتح بعد",
  "We're making a few updates. Back shortly!": "نقوم ببعض التحديثات. سنعود قريبًا!",
  "New accounts are paused for now. You can still order as a guest.": "إنشاء الحسابات متوقف حاليًا. يمكنك الطلب كضيف.",
  "We've paused new orders for a short while. Please try again soon.": "أوقفنا الطلبات الجديدة لفترة قصيرة. حاول مرة أخرى قريبًا.",
  "Keep the announcement under 200 characters": "اجعل الإعلان أقل من 200 حرف",
  "Choose up to 3 extras": "اختر 3 إضافات كحد أقصى",
  "Enter the Facebook page's name or link, like m.me/auriance": "أدخل اسم أو رابط صفحة فيسبوك، مثل m.me/auriance",
  "Enter the Facebook username or page link": "أدخل اسم المستخدم أو رابط الصفحة على فيسبوك",
  "Enter the Instagram username or profile link": "أدخل اسم المستخدم أو رابط الحساب على انستجرام",
  "Enter the TikTok username or profile link": "أدخل اسم المستخدم أو رابط الحساب على تيك توك",
  "Enter an Egyptian mobile or landline number": "أدخل رقم موبايل أو أرضي مصري",
  "We don't recognise this code": "هذا الكود غير صحيح",
  "This code isn't active": "هذا الكود غير مفعّل",
  "This code isn't valid yet": "هذا الكود لم يبدأ بعد",
  "This code has expired": "انتهت صلاحية هذا الكود",
  "This code has already been used up": "تم استخدام هذا الكود بالكامل",
  "You've already used this code": "لقد استخدمت هذا الكود من قبل",
  "This code is for another section of the shop": "هذا الكود لقسم آخر في المتجر",
  "Give the promotion a name": "اكتب اسمًا للعرض",
  "A % off must be between 1 and 100": "نسبة الخصم يجب أن تكون بين 1 و100",
  "Enter the amount off": "أدخل قيمة الخصم",
  "The end must be after the start": "يجب أن تكون النهاية بعد البداية",
  "Use 3 to 30 letters (A–Z), numbers or dashes for the code": "استخدم من 3 إلى 30 حرفًا إنجليزيًا أو رقمًا أو شرطة للكود",
  "That code already exists": "هذا الكود موجود بالفعل",
  "Promo code not found": "الكود غير موجود",
  "This code was used on orders, so it can't be renamed. Create a new code instead.": "تم استخدام هذا الكود في طلبات، لذلك لا يمكن تغيير اسمه. أنشئ كودًا جديدًا بدلًا منه.",
  "This code was used on orders: switch it off instead": "تم استخدام هذا الكود في طلبات: أوقفه بدلًا من حذفه",
  "Generate up to 500 codes at a time": "يمكن إنشاء 500 كود كحد أقصى في المرة",
  "Use letters and numbers for the start of the codes": "استخدم حروفًا وأرقامًا لبداية الأكواد",
  "Enter a code": "أدخل الكود",
  "An account with this phone number already exists. Sign in instead.": "يوجد حساب بهذا الرقم بالفعل. سجّل الدخول بدلًا من ذلك.",
  "An account with this email already exists. Sign in instead.": "يوجد حساب بهذا البريد بالفعل. سجّل الدخول بدلًا من ذلك.",
  "Phone, email or password is incorrect": "الرقم أو البريد أو كلمة المرور غير صحيحة",
  "This account is closed. Message us on WhatsApp for help.": "هذا الحساب مغلق. راسلنا على واتساب للمساعدة.",
  "Another account uses this phone number": "هذا الرقم مستخدم في حساب آخر",
  "Another account uses this email": "هذا البريد مستخدم في حساب آخر",
  "Email reset isn't available yet. Message us on WhatsApp instead.": "الاستعادة بالبريد غير متاحة بعد. راسلنا على واتساب بدلًا من ذلك.",
  "This link is invalid or has expired. Ask us for a new one on WhatsApp.": "هذا الرابط غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا منا على واتساب.",
  "This link is invalid or has expired. Send a new one from your account.": "هذا الرابط غير صالح أو انتهت صلاحيته. أرسل رابطًا جديدًا من حسابك.",
  "Add an email to your account first": "أضف بريدًا إلكترونيًا لحسابك أولًا",
  "Email confirmation isn't available yet": "تأكيد البريد غير متاح بعد",
  "Enter your phone number or email": "أدخل رقم الموبايل أو البريد الإلكتروني",
  "Enter the age in months": "أدخل العمر بالشهور",
};

const SECTIONS_AR: Record<Section, string> = {
  dashboard: "لوحة التحكم",
  inventory: "المخزون",
  orders: "الطلبات",
  finance: "المالية",
};

const STATUSES_AR: Record<OrderStatus, string> = {
  new: "جديد",
  on_hold: "معلّق",
  shipped: "تم الشحن",
  partially_returned: "مُرجع جزئيًا",
  returned: "مُرجع",
  swapped: "مُستبدل",
  cancelled: "ملغى",
};

const MOVEMENT_TYPES_AR: Record<MovementType, string> = {
  restock: "توريد",
  shipment: "شحنة",
  return: "إرجاع",
  swap_out: "استبدال (صادر)",
  swap_in: "استبدال (وارد)",
  adjustment: "تسوية",
  not_sellable_in: "وارد غير قابل للبيع",
  write_off: "شطب",
  back_to_sellable: "إعادة إلى القابل للبيع",
  return_in_transit: "مرتجع في الطريق",
  transit_received: "استلام مرتجع",
  transit_write_off: "مرتجع مفقود أو تالف",
  return_write_off: "مرتجع تالف",
  cost_correction: "تصحيح تكلفة",
};

const RESTOCK_TYPES_AR: Record<RestockType, string> = {
  purchase: "شراء",
  manual_adjustment: "تسوية يدوية",
  opening: "رصيد افتتاحي",
};

const ADJUST_REASONS_AR: Record<AdjustReason, string> = {
  lost: "مفقود",
  damaged: "تالف",
  expired: "منتهي الصلاحية",
  count_correction: "تصحيح جرد",
  found: "تم العثور عليه",
  other: "أخرى",
};

const PAYMENT_METHODS_AR: Record<PaymentMethod, string> = {
  cash: "نقدًا",
  bank_transfer: "تحويل بنكي",
  card: "بطاقة",
  other: "أخرى",
};

const EXPENSE_CATEGORIES_AR: Record<ExpenseCategory, string> = {
  shipping: "الشحن",
  packaging: "التغليف",
  rent: "الإيجار",
  salaries: "الرواتب",
  marketing: "التسويق",
  utilities: "المرافق",
  other: "أخرى",
};

type FieldLabel =
  (typeof FIELD_SECTIONS)[FieldSection]["fields"][number]["label"];

const FIELD_LABELS_AR: Record<FieldLabel, string> = {
  "Product name": "اسم المنتج",
  SKU: "SKU",
  "Unit price": "سعر الوحدة",
  "Unit of measure": "وحدة القياس",
  Image: "الصورة",
  "Reorder threshold": "حد إعادة الطلب",
  Variants: "المتغيرات",
  Product: "المنتج",
  "On hand": "المتوفر",
  "Avg cost": "متوسط التكلفة",
  "Asset value": "قيمة الأصول",
  "Reorder at": "إعادة الطلب عند",
  "Stock status": "حالة المخزون",
  "Order #": "رقم الطلب",
  "Shipment #": "رقم الشحنة",
  Date: "التاريخ",
  Customer: "العميل",
  "Customer phone": "هاتف العميل",
  "Items count": "عدد العناصر",
  Total: "الإجمالي",
  Status: "الحالة",
  Payment: "الدفع",
  Notes: "الملاحظات",
  "Shipment notes": "ملاحظات الشحن",
  "Shipping fee": "رسوم الشحن",
  "To collect": "المطلوب تحصيله",
};

function byLabel<K extends string>(
  labels: Record<K, string>,
  arabic: Record<K, string>,
): Record<string, string> {
  return Object.fromEntries(
    (Object.keys(labels) as K[]).map((k) => [labels[k], arabic[k]]),
  );
}

/**
 * Short labels the server puts inside messages (statuses, methods, field names).
 * Only used for template placeholders and log segments, never for a whole value,
 * so a customer called "New" stays "New".
 */
export const LABELS: Record<string, string> = {
  ...byLabel(SECTION_LABELS, SECTIONS_AR),
  ...byLabel(ORDER_STATUS_LABELS, STATUSES_AR),
  ...byLabel(MOVEMENT_TYPE_LABELS, MOVEMENT_TYPES_AR),
  ...byLabel(RESTOCK_TYPE_LABELS, RESTOCK_TYPES_AR),
  ...byLabel(ADJUST_REASON_LABELS, ADJUST_REASONS_AR),
  ...byLabel(PAYMENT_METHOD_LABELS, PAYMENT_METHODS_AR),
  ...byLabel(EXPENSE_CATEGORY_LABELS, EXPENSE_CATEGORIES_AR),
  ...FIELD_LABELS_AR,
  // Order fields in "Updated …" notes
  customer: "العميل",
  phone: "الهاتف",
  "shipment number": "رقم الشحنة",
  offer: "العرض",
  notes: "الملاحظات",
  "shipment notes": "ملاحظات الشحن",
  address: "العنوان",
  channel: "مصدر الطلب",
  "shipping fee": "رسوم الشحن",
  // Stock buckets
  "on hand": "المتوفر",
  "not sellable": "غير القابل للبيع",
  // Date fields
  date: "التاريخ",
  "paid date": "تاريخ الدفع",
  "order date": "تاريخ الطلب",
  "expense date": "تاريخ المصروف",
  // Payment state in deletion logs
  paid: "مدفوع",
  unpaid: "غير مدفوع",
  // Swap price difference
  "no price difference": "لا يوجد فرق في السعر",
};

/** Prefixes around another message; tried before {@link TEMPLATES}. */
export const WRAPPERS: [en: string, ar: string][] = [
  ["Row {row~}: {message}", "الصف {row}: {message}"],
  ["Rows {rows~}: {message}", "الصفوف {rows}: {message}"],
  ["ORD-{n~}: {message}", "ORD-{n}: {message}"],
  ["New order: {order~}", "طلب جديد: {order}"],
  ["Website order, needs confirmation: {order~}", "طلب من الموقع بانتظار التأكيد: {order}"],
  ["Order shipped: {order~}", "تم شحن الطلب: {order}"],
  ["Order returned: {order~}", "تم إرجاع الطلب: {order}"],
  ["Order swapped: {order~}", "تم الاستبدال في الطلب: {order}"],
  ["Order cancelled: {order~}", "تم إلغاء الطلب: {order}"],
  ["On hold, waiting for stock: {order~}", "معلّق بانتظار المخزون: {order}"],
  [
    "Stock arrived, order moved to New: {order~}",
    "وصل المخزون، أصبح الطلب جديدًا: {order}",
  ],
  ["Low stock: {item~}", "مخزون منخفض: {item}"],
];

/** Messages with values in them; the one with the most fixed text wins. */
export const TEMPLATES: [en: string, ar: string][] = [
  ['Shipment number "{number~}" is entered twice', 'رقم الشحنة "{number}" مكتوب مرتين'],
  ["{label~} is added twice: change the quantity on one line instead", "{label} مضاف مرتين: عدّل الكمية في سطر واحد بدلًا من ذلك"],
  ["Add {amount~} more to use this code", "أضف {amount} لاستخدام هذا الكود"],
  ["You can order up to {n~} of {name~} per order", "يمكنك طلب {n} قطع بحد أقصى من {name} في الطلب الواحد"],
  // Due-date reminders
  ["Credit card payment due {day~}", "موعد سداد بطاقة الائتمان {day}"],
  ["Payment due {day~}", "موعد سداد {day}"],
  ["Courier collection due {day~}: {n~} orders", "موعد تحصيل الشحن {day}: {n} طلبات"],
  // Customer shop
  [
    "Sorry, not enough left of: {items~}. Update your cart and try again.",
    "عذرًا، الكمية المتبقية لا تكفي من: {items}. عدّل سلتك وحاول مرة أخرى.",
  ],
  // Closing
  ['Closing entry "{memo~}" doesn\'t balance', 'قيد الإقفال "{memo}" غير متوازن'],
  ["Enter a balance for every account (missing: {codes~})", "أدخل رصيدًا لكل حساب (الناقص: {codes})"],
  [
    "The explanations for {code~} {name~} add up to more than its difference",
    "تفسيرات {code} {name} أكبر من الفرق",
  ],
  [
    "The books are closed up to {date~}. Use a later date, or reopen that month.",
    "الدفاتر مُقفلة حتى {date}. استخدم تاريخًا لاحقًا أو أعد فتح ذلك الشهر.",
  ],
  // Ledger
  [
    "The entry isn't balanced: debits {debits~} and credits {credits~}",
    "القيد غير متوازن: المدين {debits} والدائن {credits}",
  ],
  [
    "{account~} is filled automatically and can't be used in a manual entry",
    "{account} يُملأ تلقائيًا ولا يمكن استخدامه في قيد يدوي",
  ],
  [
    "Code {code~} is already used by another account",
    "الكود {code} مستخدم لحساب آخر",
  ],
  ["Choose boys or girls for {item~}", "اختر أولادي أو بناتي لـ {item}"],
  // Catalog
  ['SKU "{sku~}" is already used', 'رمز SKU "{sku}" مستخدم بالفعل'],
  ['SKU "{sku~}" is used more than once', 'رمز SKU "{sku}" مستخدم أكثر من مرة'],
  ["Choose a variant of {product~}", "اختر متغيرًا من {product}"],
  [
    "That variant doesn't belong to {product~}",
    "هذا المتغير لا ينتمي إلى {product}",
  ],
  ["{product~} has no variants", "{product} ليس له متغيرات"],
  ["{product~} is inactive", "{product} غير نشط"],
  ["{product~} – {variant~} is inactive", "{product} – {variant} غير نشط"],
  [
    '"{item~}" is on orders that are New or On hold: {orders~}. Ship or cancel them first.',
    '"{item}" موجود في طلبات جديدة أو معلّقة: {orders}. اشحنها أو ألغِها أولًا.',
  ],

  // Stock
  [
    "Can't undo this movement: it would leave {field} stock at {qty~}. Only {current~} unit(s) are {field2} now.",
    "لا يمكن التراجع عن هذه الحركة: سيصبح المخزون ({field}) {qty}. المتاح حاليًا ({field2}) {current} وحدة فقط.",
  ],
  [
    "Only {n~} not-sellable unit(s) available to write off",
    "المتاح للشطب {n} وحدة غير قابلة للبيع فقط",
  ],
  [
    "Only {n~} not-sellable unit(s) available to move",
    "المتاح للنقل {n} وحدة غير قابلة للبيع فقط",
  ],
  [
    "Only {n~} {uom~} on hand. You can't remove more than that.",
    "المتوفر {n} {uom} فقط. لا يمكنك إزالة أكثر من ذلك.",
  ],
  [
    "This movement belongs to {order~}. Return the items or delete the order instead.",
    "هذه الحركة تابعة للطلب {order}. أرجِع العناصر أو احذف الطلب بدلًا من ذلك.",
  ],

  // Permissions, fields, settings, team
  [
    "You don't have access to {sections|}. Ask an admin.",
    "ليست لديك صلاحية الوصول إلى {sections}. اطلب ذلك من المسؤول.",
  ],
  ["{label} is required and can't be hidden", "{label} مطلوب ولا يمكن إخفاؤه"],
  ['"{code~}" isn\'t a known currency code', 'رمز العملة "{code}" غير معروف'],
  [
    '"{locale~}" isn\'t a supported locale',
    'الإعداد الإقليمي "{locale}" غير مدعوم',
  ],
  ['"{zone~}" isn\'t a known timezone', 'المنطقة الزمنية "{zone}" غير معروفة'],
  ["{email~} is already on the team", "{email} موجود بالفعل في الفريق"],
  [
    "Password must be at least {n~} characters",
    "يجب ألا تقل كلمة المرور عن {n} أحرف",
  ],
  ["Unknown procedure {name~}", "إجراء غير معروف: {name}"],

  // Dates
  ["The {label} can't be in the future", "لا يمكن أن يكون {label} في المستقبل"],
  ["Enter a valid {label}", "أدخل {label} صالحًا"],

  // Orders and payments
  ["Re-recorded from {order~}", "أعيد تسجيله من الطلب {order}"],
  ["Ship on {day~}: confirm with the customer first", "الشحن يوم {day}: أكّد مع العميل أولًا"],
  ["Ship date moved from {from~} to {to~}: confirm with the customer first", "تم تغيير موعد الشحن من {from} إلى {to}: أكّد مع العميل أولًا"],
  ["Delayed by the customer: ship on {day~}", "مؤجَّل بطلب العميل: الشحن يوم {day}"],
  ["Ship date moved from {from~} to {to~}", "تم تغيير موعد الشحن من {from} إلى {to}"],
  ["More than what's owed to {name~}", "أكثر من المستحق لـ {name}"],
  ["Owed to {name~}", "مستحق لـ {name}"],
  ["{name~} can't take out more than their profit share", "لا يمكن أن يسحب {name} أكثر من نصيبه في الربح"],
  ["Price corrected from {from~} to {to~}: {reason~}", "تم تصحيح السعر من {from} إلى {to}: {reason}"],
  ["Partly returned (courier settlement): {amount~} collected; the rest closes when the returned pieces are recorded", "مرتجع جزئي (تسوية شركة الشحن): تم تحصيل {amount}، ويُغلق الباقي عند تسجيل القطع المرتجعة"],
  ["Not enough free stock for {label~}: {free~} free, {units~} needed. The rest is held for other orders.", "لا يوجد مخزون متاح كافٍ لـ {label}: المتاح {free}، والمطلوب {units}. الباقي محجوز لطلبات أخرى."],
  ["{order~} has nothing left to return", "لا يوجد في {order} ما يمكن إرجاعه"],
  [
    "{order~} has no return in transit",
    "لا يوجد مرتجع في الطريق للطلب {order}",
  ],
  [
    "Only {n~} unit(s) of this item are in transit",
    "في الطريق {n} وحدة فقط من هذا الصنف",
  ],
  ["Re-recorded as {order~}", "أعيد تسجيله كالطلب {order}"],
  [
    'Shipment number "{number~}" is already used by {order~}',
    'رقم الشحنة "{number}" مستخدم بالفعل في الطلب {order}',
  ],
  [
    "Not enough stock for {item~}: {onHand~} on hand, {needed~} needed",
    "المخزون غير كافٍ لـ {item}: المتوفر {onHand} والمطلوب {needed}",
  ],
  [
    "Not enough stock for {item~}: {available~} available ({onHand~} on hand, {reserved~} held for other orders), {needed~} needed",
    "المخزون غير كافٍ لـ {item}: المتاح {available} (المتوفر {onHand}، محجوز لطلبات أخرى {reserved})، والمطلوب {needed}",
  ],
  [
    "{item~} is no longer in the catalog, so it can't be shipped",
    "{item} لم يعد في الكتالوج، لذا لا يمكن شحنه",
  ],
  [
    "You can return up to {n~} unit(s) of {item~} (shipped and not yet returned)",
    "يمكنك إرجاع {n} وحدة كحد أقصى من {item} (مشحونة ولم تُرجَع بعد)",
  ],
  [
    "You can swap up to {n~} unit(s) of {item~} (shipped and not yet returned)",
    "يمكنك استبدال {n} وحدة كحد أقصى من {item} (مشحونة ولم تُرجَع بعد)",
  ],
  ["Select at most {n~} orders at a time", "اختر {n} طلب كحد أقصى في كل مرة"],

  // Imports
  [
    'No product or variant with SKU "{sku~}"',
    'لا يوجد منتج أو متغير برمز SKU "{sku}"',
  ],
  [
    'Variant "{variant~}" not found for SKU "{sku~}"',
    'المتغير "{variant}" غير موجود لرمز SKU "{sku}"',
  ],
  [
    "{product~} has variants. Use the variant SKU or add a variant column",
    "{product} له متغيرات. استخدم رمز SKU الخاص بالمتغير أو أضف عمودًا للمتغير",
  ],
  ['SKU "{sku~}" already exists', 'رمز SKU "{sku}" موجود بالفعل'],
  [
    '"{item~}" is on several rows, so every row needs a variant_name',
    '"{item}" موجود في عدة صفوف، لذا يحتاج كل صف إلى variant_name',
  ],
  [
    '"{item~}" appears more than once. Add a variant_name to import variants',
    '"{item}" مكرر. أضف variant_name لاستيراد المتغيرات',
  ],
  [
    "product details differ from row {first~}; row {used~} was used",
    "تفاصيل المنتج تختلف عن الصف {first}؛ تم استخدام الصف {used}",
  ],

  // Order history notes (a user's note after the summary stays as written)
  ["Updated {fields*}", "تم تحديث {fields}"],
  [
    "You can view {section~} but not change it. Ask an admin.",
    "يمكنك عرض {section} لكن لا يمكنك تعديله. اطلب ذلك من المسؤول.",
  ],
  [
    '"{item~}" has stock, movements or orders, so it can\'t be deleted. Mark it inactive instead.',
    '"{item}" لديه مخزون أو حركات أو طلبات، لذلك لا يمكن حذفه. اجعله غير نشط بدلًا من ذلك.',
  ],
  ["Shipped {n~} unit(s)", "تم شحن {n} وحدة"],
  [
    "Couldn't save the photo to storage ({status~}). Try again.",
    "تعذّر حفظ الصورة في التخزين ({status}). حاول مرة أخرى.",
  ],
  ["Marked paid ({method})", "تم التسجيل كمدفوع ({method})"],
  ["Full return, refund {amount~}", "إرجاع كامل، استرداد {amount}"],
  [
    "Full return, refund {amount~}. {note~}",
    "إرجاع كامل، استرداد {amount}. {note}",
  ],
  ["Partial return, refund {amount~}", "إرجاع جزئي، استرداد {amount}"],
  [
    "Partial return, refund {amount~}. {note~}",
    "إرجاع جزئي، استرداد {amount}. {note}",
  ],
  [
    "Swapped {out~} × {line~} for {in~} × {item~}, no price difference",
    "استبدال {out} × {line} بـ {in} × {item}، لا يوجد فرق في السعر",
  ],
  [
    "Swapped {out~} × {line~} for {in~} × {item~}, no price difference. {note~}",
    "استبدال {out} × {line} بـ {in} × {item}، لا يوجد فرق في السعر. {note}",
  ],
  [
    "Swapped {out~} × {line~} for {in~} × {item~}, customer pays {amount~} more",
    "استبدال {out} × {line} بـ {in} × {item}، يدفع العميل {amount} إضافية",
  ],
  [
    "Swapped {out~} × {line~} for {in~} × {item~}, customer pays {amount~} more. {note~}",
    "استبدال {out} × {line} بـ {in} × {item}، يدفع العميل {amount} إضافية. {note}",
  ],
  [
    "Swapped {out~} × {line~} for {in~} × {item~}, customer refunded {amount~}",
    "استبدال {out} × {line} بـ {in} × {item}، استرداد {amount} للعميل",
  ],
  [
    "Swapped {out~} × {line~} for {in~} × {item~}, customer refunded {amount~}. {note~}",
    "استبدال {out} × {line} بـ {in} × {item}، استرداد {amount} للعميل. {note}",
  ],
  [
    "Item no longer in catalog, no stock change ({item~})",
    "العنصر لم يعد في الكتالوج، دون تغيير في المخزون ({item})",
  ],
  [
    "Item removed from catalog: {item~}",
    "تمت إزالة العنصر من الكتالوج: {item}",
  ],

  // Notification bodies
  [
    "{customer~}: full return, refund {amount~}",
    "{customer}: إرجاع كامل، استرداد {amount}",
  ],
  [
    "{customer~}: partial return, refund {amount~}",
    "{customer}: إرجاع جزئي، استرداد {amount}",
  ],
  ["{customer~}: no price difference", "{customer}: لا يوجد فرق في السعر"],
  [
    "{customer~}: customer pays {amount~} more",
    "{customer}: يدفع العميل {amount} إضافية",
  ],
  [
    "{customer~}: customer refunded {amount~}",
    "{customer}: استرداد {amount} للعميل",
  ],
  [
    "{onHand~} {uom~} left, reorder at {threshold~}",
    "متبقٍ {onHand} {uom}، إعادة الطلب عند {threshold}",
  ],

  // Deletion log segments
  ["status: {status}", "الحالة: {status}"],
  ["qty: {qty~}", "الكمية: {qty}"],
  ["date: {date~}", "التاريخ: {date}"],
  ["variants: {n~}", "المتغيرات: {n}"],
  ["Reversed {qty~} → {field} now {n~}", "تم عكس {qty} ← {field} الآن {n}"],
  [
    "{item~}: reversed {qty~} → on hand {n~}",
    "{item}: تم عكس {qty} ← المتوفر {n}",
  ],
  [
    "{item~}: reversed {qty~} → not sellable {n~}",
    "{item}: تم عكس {qty} ← غير القابل للبيع {n}",
  ],
  [
    "Removed {rows~} stock row(s) ({onHand~} on hand) and {moves~} movement(s)",
    "تمت إزالة {rows} سجل مخزون ({onHand} متوفر) و{moves} حركة",
  ],
  [
    "kept {lines~} order line(s) and {moves~} order movement(s)",
    "مع الإبقاء على {lines} بند طلب و{moves} حركة طلب",
  ],

  // A validation message for one field ("lineItems.0.quantity: …")
  ["{field~}: {message}", "{field}: {message}"],
];
