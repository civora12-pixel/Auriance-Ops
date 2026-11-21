// Arabic for the orders area. Keys are the English text exactly as written in t("…").
export const orders: Record<string, string> = {
  // Shared form bits
  "(optional)": "(اختياري)",
  Cancel: "إلغاء",
  Note: "ملاحظة",
  Notes: "ملاحظات",
  Quantity: "الكمية",
  "Unit price": "سعر الوحدة",
  Customer: "العميل",
  "Customer name": "اسم العميل",
  Phone: "الهاتف",
  "Customer phone": "هاتف العميل",
  "Shipment number": "رقم الشحنة",
  "Shipment #": "رقم الشحنة",
  "Shipment notes": "ملاحظات الشحنة",
  "Offer name": "اسم العرض",
  "Order date": "تاريخ الطلب",
  Product: "المنتج",
  Items: "المنتجات",
  Total: "الإجمالي",
  Subtotal: "المجموع الفرعي",
  "Items subtotal": "المجموع الفرعي للمنتجات",
  Discount: "الخصم",
  Surcharge: "رسوم إضافية",
  "Original total": "الإجمالي الأصلي",
  "Order total": "إجمالي الطلب",
  "New order total": "إجمالي الطلب الجديد",
  Refund: "الاسترداد",
  Replacement: "البديل",
  "Back to stock": "إعادة إلى المخزون",
  "Damaged, write off": "تالف، يُشطب",
  "Use at most 2 decimal places": "استخدم منزلتين عشريتين كحد أقصى",
  "Enter a whole number": "أدخل عددًا صحيحًا",
  "Use at most 50 characters": "50 حرفًا كحد أقصى",
  "Use at most 100 characters": "100 حرف كحد أقصى",
  "Use at most 200 characters": "200 حرف كحد أقصى",
  "Use at most 2,000 characters": "2,000 حرف كحد أقصى",
  "Enter the customer's name": "أدخل اسم العميل",
  "Enter the shipment number": "أدخل رقم الشحنة",
  "{{onHand}} {{uom}} in stock": "المتوفر في المخزون: {{onHand}} {{uom}}",
  "Only {{onHand}} {{uom}} in stock":
    "المتوفر في المخزون {{onHand}} {{uom}} فقط",

  // Orders list
  Orders: "الطلبات",
  "Capture orders, ship them and track payment.":
    "سجّل الطلبات واشحنها وتابع الدفع.",
  "New order": "طلب جديد",
  All: "الكل",
  Open: "المفتوحة",
  "Order #, customer, phone, shipment…": "رقم الطلب، العميل، الهاتف، الشحنة…",
  "Search orders": "البحث في الطلبات",
  "Clear search": "مسح البحث",
  Payment: "الدفع",
  "Any payment": "أي حالة دفع",
  Paid: "مدفوع",
  Unpaid: "غير مدفوع",
  "Shipped, unpaid": "مشحون وغير مدفوع",
  "Ordered from": "تاريخ الطلب من",
  to: "إلى",
  "Ordered until": "تاريخ الطلب حتى",
  "The start date is after the end date": "تاريخ البداية بعد تاريخ النهاية",
  "Clear filters": "مسح عوامل التصفية",
  "Bulk actions": "إجراءات جماعية",
  "{{count}} selected": "المحدد: {{count}}",
  Clear: "مسح",
  "Mark as paid ({{count}})": "تسجيل كمدفوع ({{count}})",
  "No orders yet": "لا توجد طلبات بعد",
  "Create your first order to start tracking shipments and payments.":
    "أنشئ طلبك الأول لبدء تتبع الشحنات والمدفوعات.",
  "No orders match": "لا توجد طلبات مطابقة",
  "Try another status, search or date range.":
    "جرّب حالة أو بحثًا أو نطاق تاريخ آخر.",
  "Mark {{count}} as paid": "تسجيل {{count}} كمدفوع",
  "Record payment for {{count}} selected orders._zero":
    "تسجيل الدفع لـ {{count}} طلب محدد.",
  "Record payment for {{count}} selected orders._one":
    "تسجيل الدفع لطلب واحد محدد.",
  "Record payment for {{count}} selected orders._two":
    "تسجيل الدفع لطلبين محددين.",
  "Record payment for {{count}} selected orders._few":
    "تسجيل الدفع لـ {{count}} طلبات محددة.",
  "Record payment for {{count}} selected orders._many":
    "تسجيل الدفع لـ {{count}} طلبًا محددًا.",
  "Record payment for {{count}} selected orders._other":
    "تسجيل الدفع لـ {{count}} طلب محدد.",
  "{{count}} orders marked as paid_zero": "لم يُسجَّل أي طلب كمدفوع",
  "{{count}} orders marked as paid_one": "تم تسجيل طلب واحد كمدفوع",
  "{{count}} orders marked as paid_two": "تم تسجيل طلبين كمدفوعين",
  "{{count}} orders marked as paid_few": "تم تسجيل {{count}} طلبات كمدفوعة",
  "{{count}} orders marked as paid_many": "تم تسجيل {{count}} طلبًا كمدفوع",
  "{{count}} orders marked as paid_other": "تم تسجيل {{count}} طلب كمدفوع",
  "{{count}} orders marked as paid ({{skipped}} skipped: already paid or cancelled)_zero":
    "لم يُسجَّل أي طلب كمدفوع (تم تخطي {{skipped}}: مدفوعة أو ملغاة مسبقًا)",
  "{{count}} orders marked as paid ({{skipped}} skipped: already paid or cancelled)_one":
    "تم تسجيل طلب واحد كمدفوع (تم تخطي {{skipped}}: مدفوعة أو ملغاة مسبقًا)",
  "{{count}} orders marked as paid ({{skipped}} skipped: already paid or cancelled)_two":
    "تم تسجيل طلبين كمدفوعين (تم تخطي {{skipped}}: مدفوعة أو ملغاة مسبقًا)",
  "{{count}} orders marked as paid ({{skipped}} skipped: already paid or cancelled)_few":
    "تم تسجيل {{count}} طلبات كمدفوعة (تم تخطي {{skipped}}: مدفوعة أو ملغاة مسبقًا)",
  "{{count}} orders marked as paid ({{skipped}} skipped: already paid or cancelled)_many":
    "تم تسجيل {{count}} طلبًا كمدفوع (تم تخطي {{skipped}}: مدفوعة أو ملغاة مسبقًا)",
  "{{count}} orders marked as paid ({{skipped}} skipped: already paid or cancelled)_other":
    "تم تسجيل {{count}} طلب كمدفوع (تم تخطي {{skipped}}: مدفوعة أو ملغاة مسبقًا)",

  // Orders table and cards
  "Select all unpaid orders on this page":
    "تحديد كل الطلبات غير المدفوعة في هذه الصفحة",
  "Select {{order}}": "تحديد {{order}}",
  Order: "الطلب",
  Date: "التاريخ",
  Status: "الحالة",
  "{{count}} units_zero": "{{count}} وحدة",
  "{{count}} units_one": "وحدة واحدة",
  "{{count}} units_two": "وحدتان",
  "{{count}} units_few": "{{count}} وحدات",
  "{{count}} units_many": "{{count}} وحدة",
  "{{count}} units_other": "{{count}} وحدة",
  "{{count}} lines_zero": "{{count}} بند",
  "{{count}} lines_one": "بند واحد",
  "{{count}} lines_two": "بندان",
  "{{count}} lines_few": "{{count}} بنود",
  "{{count}} lines_many": "{{count}} بندًا",
  "{{count}} lines_other": "{{count}} بند",

  // CSV export
  "Export CSV": "تصدير CSV",
  "No orders match the current filters":
    "لا توجد طلبات تطابق عوامل التصفية الحالية",
  "Exported {{count}} orders_zero": "لم يُصدَّر أي طلب",
  "Exported {{count}} orders_one": "تم تصدير طلب واحد",
  "Exported {{count}} orders_two": "تم تصدير طلبين",
  "Exported {{count}} orders_few": "تم تصدير {{count}} طلبات",
  "Exported {{count}} orders_many": "تم تصدير {{count}} طلبًا",
  "Exported {{count}} orders_other": "تم تصدير {{count}} طلب",
  "Order #": "رقم الطلب",
  "Sales rep": "مندوب المبيعات",
  "Line items": "البنود",
  Units: "الوحدات",
  Offer: "العرض",
  "Payment method": "طريقة الدفع",
  "Shipped on": "تاريخ الشحن",

  // New order
  "Order created": "تم إنشاء الطلب",
  "Stock is deducted when the order ships, not when it's created.":
    "يُخصم المخزون عند شحن الطلب، لا عند إنشائه.",
  "Customer & shipment": "العميل والشحنة",
  "e.g. AWB or tracking number": "مثل رقم بوليصة الشحن أو رقم التتبع",
  "Remove {{item}}": "إزالة {{item}}",
  "Remove line": "إزالة البند",
  "Only {{onHand}} {{uom}} in stock. You can save the order, but it can't ship until you restock.":
    "المتوفر في المخزون {{onHand}} {{uom}} فقط. يمكنك حفظ الطلب، لكن لا يمكن شحنه قبل إعادة التخزين.",
  "Add product": "إضافة منتج",
  Pricing: "التسعير",
  "Custom total": "إجمالي مخصص",
  "Item prices come from the product catalog. Set a different total for bundles, discounts or delivery fees.":
    "أسعار المنتجات مأخوذة من كتالوج المنتجات. حدّد إجماليًا مختلفًا للباقات أو الخصومات أو رسوم التوصيل.",
  "e.g. Summer bundle": "مثل باقة الصيف",
  "Anything the team should know": "أي شيء يجب أن يعرفه الفريق",
  "Address details, delivery window…": "تفاصيل العنوان، موعد التوصيل…",
  "Create order": "إنشاء الطلب",
  "Choose a product": "اختر منتجًا",
  "Enter the order date": "أدخل تاريخ الطلب",
  "The order date can't be in the future":
    "لا يمكن أن يكون تاريخ الطلب في المستقبل",
  "Add at least one product": "أضف منتجًا واحدًا على الأقل",
  "An order can have at most 200 lines":
    "يمكن أن يحتوي الطلب على 200 بند كحد أقصى",
  "Enter the order total": "أدخل إجمالي الطلب",

  // Order page
  "Order not found": "الطلب غير موجود",
  "It may have been deleted, or the link is wrong.":
    "ربما حُذف، أو أن الرابط غير صحيح.",
  "Back to orders": "العودة إلى الطلبات",
  "Copy {{text}}": "نسخ {{text}}",
  "Couldn't copy to the clipboard": "تعذّر النسخ إلى الحافظة",
  "Packing slip": "قائمة التعبئة",
  "by {{name}}": "بواسطة {{name}}",
  "Ship the rest": "شحن المتبقي",
  "Ship order": "شحن الطلب",
  "Ship some": "شحن جزء",
  Reopen: "إعادة فتح",
  Return: "إرجاع",
  Swap: "استبدال",
  Print: "طباعة",
  "More actions": "إجراءات أخرى",
  "Put on hold": "تعليق",
  "Move back to New": "إعادة إلى «جديد»",
  "Cancel order": "إلغاء الطلب",
  "Partly shipped": "تم شحن جزء منه",
  "{{shipped}} of {{total}} units have gone out. Ship the remaining {{remaining}} to complete the order.":
    "تم شحن {{shipped}} من أصل {{total}} وحدة. اشحن الـ {{remaining}} المتبقية لإكمال الطلب.",
  "This order is marked as paid, so it can't be cancelled until it's marked unpaid.":
    "هذا الطلب مسجّل كمدفوع، لذا لا يمكن إلغاؤه قبل تسجيله كغير مدفوع.",
  "Danger zone": "منطقة الخطر",
  "Deleting reverses this order's stock movements and removes its history. It's recorded in the deletion log.":
    "يؤدي الحذف إلى عكس حركات المخزون لهذا الطلب وإزالة سجله. ويُدوَّن ذلك في سجل الحذف.",
  "Delete order": "حذف الطلب",
  "Ship the rest of this order?": "شحن المتبقي من هذا الطلب؟",
  "Ship this order?": "شحن هذا الطلب؟",
  "{{count}} units will be taken out of stock and the order marked as shipped._zero":
    "سيُخصم {{count}} وحدة من المخزون وتصبح حالة الطلب «تم الشحن».",
  "{{count}} units will be taken out of stock and the order marked as shipped._one":
    "ستُخصم وحدة واحدة من المخزون وتصبح حالة الطلب «تم الشحن».",
  "{{count}} units will be taken out of stock and the order marked as shipped._two":
    "ستُخصم وحدتان من المخزون وتصبح حالة الطلب «تم الشحن».",
  "{{count}} units will be taken out of stock and the order marked as shipped._few":
    "ستُخصم {{count}} وحدات من المخزون وتصبح حالة الطلب «تم الشحن».",
  "{{count}} units will be taken out of stock and the order marked as shipped._many":
    "ستُخصم {{count}} وحدة من المخزون وتصبح حالة الطلب «تم الشحن».",
  "{{count}} units will be taken out of stock and the order marked as shipped._other":
    "ستُخصم {{count}} وحدة من المخزون وتصبح حالة الطلب «تم الشحن».",
  Ship: "شحن",
  "Put this order on hold?": "تعليق هذا الطلب؟",
  "It stays open. You can ship it, or part of it, at any time.":
    "يبقى الطلب مفتوحًا. يمكنك شحنه كله أو جزءًا منه في أي وقت.",
  "Order put on hold": "تم تعليق الطلب",
  "Waiting for stock, customer asked to wait…":
    "بانتظار المخزون، طلب العميل الانتظار…",
  "Move this order back to New?": "إعادة هذا الطلب إلى «جديد»؟",
  "Move to New": "نقل إلى «جديد»",
  "Order moved back to New": "أُعيد الطلب إلى «جديد»",
  "Cancel {{order}}?": "إلغاء {{order}}؟",
  "Nothing has shipped, so stock doesn't change. You can reopen the order later.":
    "لم يُشحن شيء، لذا لن يتغير المخزون. يمكنك إعادة فتح الطلب لاحقًا.",
  "Order cancelled": "تم إلغاء الطلب",
  "Customer changed their mind…": "غيّر العميل رأيه…",
  Reason: "السبب",
  "Reopen this order?": "إعادة فتح هذا الطلب؟",
  "It goes back to New so it can be shipped.":
    "يعود الطلب إلى «جديد» ليصبح جاهزًا للشحن.",
  "Order reopened": "أُعيد فتح الطلب",
  "Delete {{order}} permanently?": "حذف {{order}} نهائيًا؟",
  "Stock moved by this order is put back, and the order, its history and its refunds are removed. This can't be undone.":
    "يُعاد المخزون الذي حرّكه هذا الطلب، ويُحذف الطلب وسجله ومبالغ استرداده. لا يمكن التراجع عن ذلك.",
  "Order deleted": "تم حذف الطلب",
  "Not in catalog": "غير موجود في الكتالوج",
  Shipped: "تم الشحن",
  "{{shipped}} of {{quantity}} shipped": "تم شحن {{shipped}} من {{quantity}}",
  "{{count}} returned": "مُرتجع: {{count}}",
  Refunded: "المبلغ المسترد",
  "Swap adjustment": "تسوية الاستبدال",
  "The total was set by hand.": "تم تحديد الإجمالي يدويًا.",
  "Customer & shipping": "العميل والشحن",
  Edit: "تعديل",
  "First shipped": "أول شحن",
  "Refund of {{amount}}": "استرداد {{amount}}",
  "Swap: customer pays {{amount}} more":
    "استبدال: يدفع العميل {{amount}} إضافية",
  "Swap: refund of {{amount}}": "استبدال: استرداد {{amount}}",
  Activity: "النشاط",
  "No activity yet.": "لا يوجد نشاط بعد.",

  // Payment card
  Amount: "المبلغ",
  "Amount due": "المبلغ المستحق",
  "Paid on": "تاريخ الدفع",
  Method: "الطريقة",
  "Not specified": "غير محددة",
  "Cancelled orders can't be marked as paid.":
    "لا يمكن تسجيل الطلبات الملغاة كمدفوعة.",
  "Mark as paid": "تسجيل كمدفوع",
  "Mark unpaid": "تسجيل كغير مدفوع",
  "Record that {{customer}} paid {{amount}} for {{order}}.":
    "تسجيل أن {{customer}} دفع {{amount}} مقابل {{order}}.",
  "Marked as paid": "تم التسجيل كمدفوع",
  "Mark this order unpaid?": "تسجيل هذا الطلب كغير مدفوع؟",
  "The payment date and method are cleared, and the order shows as money still owed.":
    "يُمسح تاريخ الدفع وطريقته، ويظهر الطلب كمبلغ لا يزال مستحقًا.",
  "Marked as unpaid": "تم التسجيل كغير مدفوع",

  // Ship items
  "Ship items": "شحن المنتجات",
  "Choose what's going out now. Shipped units are taken from stock. If anything is left, the order stays on hold.":
    "اختر ما سيُشحن الآن. تُخصم الوحدات المشحونة من المخزون، وإذا تبقّى شيء يبقى الطلب معلّقًا.",
  "Only {{count}} left to ship": "المتبقي للشحن {{count}} فقط",
  "Only {{count}} in stock": "المتوفر في المخزون {{count}} فقط",
  "Enter how many units to ship": "أدخل عدد الوحدات المراد شحنها",
  "{{count}} units shipped. {{rest}} still to ship._zero":
    "تم شحن {{count}} وحدة. لا يزال {{rest}} بانتظار الشحن.",
  "{{count}} units shipped. {{rest}} still to ship._one":
    "تم شحن وحدة واحدة. لا يزال {{rest}} بانتظار الشحن.",
  "{{count}} units shipped. {{rest}} still to ship._two":
    "تم شحن وحدتين. لا يزال {{rest}} بانتظار الشحن.",
  "{{count}} units shipped. {{rest}} still to ship._few":
    "تم شحن {{count}} وحدات. لا يزال {{rest}} بانتظار الشحن.",
  "{{count}} units shipped. {{rest}} still to ship._many":
    "تم شحن {{count}} وحدة. لا يزال {{rest}} بانتظار الشحن.",
  "{{count}} units shipped. {{rest}} still to ship._other":
    "تم شحن {{count}} وحدة. لا يزال {{rest}} بانتظار الشحن.",
  "Order shipped": "تم شحن الطلب",
  "{{remaining}} of {{quantity}} left to ship":
    "متبقٍ للشحن {{remaining}} من {{quantity}}",
  "{{stock}} in stock": "المتوفر في المخزون: {{stock}}",
  "no longer in the catalog": "لم يعد في الكتالوج",
  "Fill in everything that's left": "تعبئة كل المتبقي",
  "Courier, tracking details…": "شركة الشحن، تفاصيل التتبع…",
  "Ship {{count}} units_zero": "شحن {{count}} وحدة",
  "Ship {{count}} units_one": "شحن وحدة واحدة",
  "Ship {{count}} units_two": "شحن وحدتين",
  "Ship {{count}} units_few": "شحن {{count}} وحدات",
  "Ship {{count}} units_many": "شحن {{count}} وحدة",
  "Ship {{count}} units_other": "شحن {{count}} وحدة",

  // Return items
  "Return items": "إرجاع منتجات",
  "Sellable units go back into stock. Damaged ones are written off. The refund is taken off the order total.":
    "تعود الوحدات الصالحة للبيع إلى المخزون، وتُشطب التالفة. ويُخصم مبلغ الاسترداد من إجمالي الطلب.",
  "Enter a whole number, at least 1": "أدخل عددًا صحيحًا لا يقل عن 1",
  "Only {{count}} can be returned": "يمكن إرجاع {{count}} فقط",
  "Enter the refund amount": "أدخل مبلغ الاسترداد",
  "Enter a valid amount": "أدخل مبلغًا صحيحًا",
  "Can't be more than the current total, {{total}}":
    "لا يمكن أن يتجاوز الإجمالي الحالي، {{total}}",
  "Return recorded. Refund {{amount}} to the customer.":
    "تم تسجيل الإرجاع. ردّ {{amount}} إلى العميل.",
  "Return recorded": "تم تسجيل الإرجاع",
  "{{price}} each": "{{price}} للوحدة",
  "{{count}} returnable": "قابل للإرجاع: {{count}}",
  "no longer in the catalog, stock won't change":
    "لم يعد في الكتالوج، لن يتغير المخزون",
  "Select at least one item to return": "اختر منتجًا واحدًا على الأقل لإرجاعه",
  "This order has a custom total, so enter the refund for a partial return.":
    "لهذا الطلب إجمالي مخصص، لذا أدخل مبلغ الاسترداد للإرجاع الجزئي.",
  "Enter a different refund amount": "إدخال مبلغ استرداد مختلف",
  "Refund amount": "مبلغ الاسترداد",
  "Up to {{total}}, the order's current total.":
    "حتى {{total}}، وهو الإجمالي الحالي للطلب.",
  "Order becomes": "تصبح حالة الطلب",
  "The order isn't marked as paid yet, so this lowers what the customer owes.":
    "لم يُسجَّل الطلب كمدفوع بعد، لذا سيُخفض هذا المبلغ المستحق على العميل.",
  "Wrong size, damaged in transit…": "مقاس خاطئ، تلف أثناء النقل…",
  "Record return": "تسجيل الإرجاع",

  // Swap
  "Swap an item": "استبدال منتج",
  "Take back shipped units and send a replacement right away. Stock moves both ways and the price difference adjusts the order total.":
    "استرجع وحدات مشحونة وأرسل بديلًا فورًا. يتحرك المخزون في الاتجاهين ويُعدَّل إجمالي الطلب بفرق السعر.",
  "Enter a quantity": "أدخل الكمية",
  "Use a whole number": "استخدم عددًا صحيحًا",
  "Must be at least {{min}}": "يجب ألا يقل عن {{min}}",
  "Enter a valid number": "أدخل رقمًا صحيحًا",
  "Can't be negative": "لا يمكن أن يكون سالبًا",
  "Choose the item being swapped": "اختر المنتج المراد استبداله",
  "Only {{count}} can be swapped": "يمكن استبدال {{count}} فقط",
  "Choose the replacement": "اختر البديل",
  "That quantity is too large": "هذه الكمية كبيرة جدًا",
  "Enter a price": "أدخل السعر",
  "Enter the refund for the returned units":
    "أدخل مبلغ الاسترداد للوحدات المرتجعة",
  "The refund can't be more than the order's current total plus the replacement":
    "لا يمكن أن يتجاوز الاسترداد إجمالي الطلب الحالي مضافًا إليه قيمة البديل",
  "Swap recorded. The customer pays {{amount}} more.":
    "تم تسجيل الاستبدال. يدفع العميل {{amount}} إضافية.",
  "Swap recorded. Refund {{amount}} to the customer.":
    "تم تسجيل الاستبدال. ردّ {{amount}} إلى العميل.",
  "Swap recorded": "تم تسجيل الاستبدال",
  "Coming back": "المُرتجع",
  "Item being swapped": "المنتج المراد استبداله",
  "Choose the item being swapped…": "اختر المنتج المراد استبداله…",
  "{{shipped}} shipped, {{price}} each": "تم شحن {{shipped}}، {{price}} للوحدة",
  "Going out": "المُرسَل",
  "Choose the replacement…": "اختر البديل…",
  "This order has a custom total, so enter how much the returned units were worth.":
    "لهذا الطلب إجمالي مخصص، لذا أدخل قيمة الوحدات المرتجعة.",
  "Enter a different refund for the returned units":
    "إدخال مبلغ استرداد مختلف للوحدات المرتجعة",
  "Refund for returned units": "الاسترداد عن الوحدات المرتجعة",
  "Returned units": "الوحدات المرتجعة",
  Difference: "الفرق",
  "Customer pays more": "يدفع العميل الفرق",
  "Refund to customer": "يُردّ للعميل",
  "No price difference": "لا يوجد فرق في السعر",
  "Exchanged for another size…": "استُبدل بمقاس آخر…",
  "Record swap": "تسجيل الاستبدال",

  // Edit details
  "Order details saved": "تم حفظ تفاصيل الطلب",
  "Edit order details": "تعديل تفاصيل الطلب",
  "Items and prices can't be changed here. Use returns and swaps for that.":
    "لا يمكن تغيير المنتجات والأسعار هنا. استخدم الإرجاع والاستبدال لذلك.",
  "Save changes": "حفظ التغييرات",
  "Only {{available}} {{uom}} available": "المتاح {{available}} {{uom}} فقط",
  "{{available}} {{uom}} available": "المتاح {{available}} {{uom}}",
  "Only {{available}} {{uom}} available ({{reserved}} held for other orders). This order will be recorded On hold until stock arrives.":
    "المتاح {{available}} {{uom}} فقط ({{reserved}} محجوزة لطلبات أخرى). سيتم تسجيل الطلب معلّقًا حتى وصول المخزون.",
  "It stays open. You can ship it at any time.":
    "يبقى مفتوحًا. يمكنك شحنه في أي وقت.",
  // Delivery details and WhatsApp
  "Enter the delivery address": "أدخل عنوان التوصيل",
  "Use at most 1,000 characters": "استخدم 1,000 حرف كحد أقصى",
  "Choose where the order came from": "اختر مصدر الطلب",
  "Enter the shipping fee": "أدخل رسوم الشحن",
  "Ordered via": "مصدر الطلب",
  "Choose a channel": "اختر المصدر",
  "Shipping fee": "رسوم الشحن",
  "Delivery address": "عنوان التوصيل",
  WhatsApp: "واتساب",
  Facebook: "فيسبوك",
  Instagram: "إنستجرام",
  "Posted {{when}}": "تم النشر {{when}}",
  "Not posted to the group yet.": "لم يُنشر في المجموعة بعد.",
  "Post again": "انشر مرة أخرى",
  "Post to WhatsApp": "انشر على واتساب",
  "Post this order to WhatsApp?": "نشر هذا الطلب على واتساب؟",
  "WhatsApp opens with the message ready. Choose the group and tap Send.":
    "سيفتح واتساب والرسالة جاهزة. اختر المجموعة واضغط إرسال.",
  Later: "لاحقًا",
  "To collect on delivery": "المطلوب تحصيله عند التسليم",
  "Stock is held for the order now and deducted when it ships.":
    "يُحجز المخزون للطلب الآن ويُخصم عند الشحن.",
  "Area, street, building, landmark…": "المنطقة، الشارع، المبنى، علامة مميزة…",
  "Item prices come from the product catalog. Set a different total for bundles or discounts.":
    "أسعار المنتجات من كتالوج المنتجات. حدّد إجماليًا مختلفًا للعروض أو الخصومات.",
  "Paid by the customer to the courier on delivery. Not part of your sales.":
    "يدفعها العميل لشركة الشحن عند التسليم، وليست ضمن مبيعاتك.",
  "Not posted to WhatsApp yet": "لم يُنشر على واتساب بعد",
  "Posted to WhatsApp": "نُشر على واتساب",
  // Packing queue
  "Shipment {{shipment}} left the queue. It was cancelled or shipped by someone else. Don't pack it.":
    "الشحنة {{shipment}} خرجت من القائمة. تم إلغاؤها أو شحنها بواسطة شخص آخر. لا تجهزها.",
  "New orders to pack, oldest first. Updates on its own.":
    "الطلبات الجديدة للتجهيز، الأقدم أولًا. تتحدث تلقائيًا.",
  "Print slips": "طباعة الإيصالات",
  "To pack ({{n}})": "للتجهيز ({{n}})",
  "Pick list": "قائمة السحب",
  "Nothing to pack": "لا يوجد ما يُجهز",
  "New orders appear here as soon as they're recorded.":
    "تظهر الطلبات الجديدة هنا فور تسجيلها.",
  "On hold ({{n}}): don't pack these yet": "معلقة ({{n}}): لا تجهزها الآن",
  "{{n}} pcs": "{{n}} قطعة",
  "Packed {{item}}": "تم تجهيز {{item}}",
  "{{done}} of {{total}} items packed": "تم تجهيز {{done}} من {{total}}",
  "Mark shipped": "تم الشحن",
  "Ship {{shipment}}?": "شحن {{shipment}}؟",
  "All items are ticked. Stock is deducted and the order is marked shipped.":
    "كل القطع محددة. سيُخصم المخزون ويُسجل الطلب كمشحون.",
  "Not every item is ticked as packed. Ship it anyway?":
    "ليست كل القطع محددة كمجهزة. هل تشحنه على أي حال؟",
  "Shipped {{shipment}}": "تم شحن {{shipment}}",
  "Nothing to pick": "لا يوجد ما يُسحب",
  "The pick list fills in as new orders come in.":
    "تمتلئ قائمة السحب مع وصول الطلبات الجديدة.",
  "{{units}} pieces across {{orders}} orders":
    "{{units}} قطعة في {{orders}} طلب",
  "in {{n}} orders": "في {{n}} طلب",
  "Re-record": "إعادة تسجيل",
  "Re-record {{order}}": "إعادة تسجيل {{order}}",
  "A new order with the same shipment number. Fix what was wrong; the cancelled order stays as it is and the two are linked.":
    "طلب جديد بنفس رقم الشحنة. صحّح ما كان خطأ؛ يبقى الطلب الملغي كما هو ويُربط الطلبان ببعض.",
  "Re-recorded from": "أعيد تسجيله من",
  "Re-recorded as": "أعيد تسجيله كـ",
  "To collect": "المطلوب تحصيله",
  "Enter the customer's phone": "أدخل رقم هاتف العميل",
  "Use an 11-digit Egyptian mobile: 010, 011, 012 or 015":
    "أدخل رقم موبايل مصري من 11 رقمًا: 010 أو 011 أو 012 أو 015",
  "Second phone": "هاتف ثانٍ",
  "On hold: waiting for stock": "معلّق: بانتظار المخزون",
  "The whole order waits until every item is available. It moves to New by itself when stock arrives. To send only what's available, cancel it and re-record it without the missing items.":
    "ينتظر الطلب كله حتى تتوفر كل القطع، ويصبح جديدًا تلقائيًا عند وصول المخزون. لإرسال المتوفر فقط، ألغِ الطلب وأعد تسجيله بدون القطع الناقصة.",
  "{{item}}: {{needed}} needed, {{available}} available":
    "{{item}}: المطلوب {{needed}}، المتاح {{available}}",
  "Nothing has shipped, so stock doesn't change. Any stock it held goes to waiting orders. You can re-record it later.":
    "لم يُشحن شيء، لذا لا يتغير المخزون. أي مخزون كان محجوزًا له يذهب للطلبات المنتظرة. يمكنك إعادة تسجيله لاحقًا.",
  "It goes back to New if its stock is available, otherwise it waits On hold.":
    "يعود جديدًا إذا كان مخزونه متاحًا، وإلا ينتظر معلّقًا.",
  "Stock is held for the order now and deducted when it ships. If any item is short, the whole order waits On hold.":
    "يُحجز المخزون للطلب الآن ويُخصم عند الشحن. إذا نقصت أي قطعة، ينتظر الطلب كله معلّقًا.",
  "Waiting for stock ({{n}}): don't pack these yet":
    "بانتظار المخزون ({{n}}): لا تجهّز هذه بعد",
  "Waiting for stock": "بانتظار المخزون",
  "The sale is reversed now, even if the items are still on their way. Received items go back to stock; damaged ones are written off.":
    "يُلغى البيع الآن حتى لو كانت القطع ما زالت في الطريق. القطع المستلمة تعود للمخزون، والتالفة تُشطب.",
  "Where are the items?": "أين القطع؟",
  "Received in the warehouse": "استُلمت في المخزن",
  "In transit (courier sheet)": "في الطريق (كشف المندوب)",
  "Return in transit: {{n}} pieces on their way back":
    "مرتجع في الطريق: {{n}} قطعة عائدة",
  "The sale is already reversed. When the parcel arrives, mark it received to put the items back in stock.":
    "تم إلغاء البيع بالفعل. عند وصول الطرد، أكّد الاستلام لإعادة القطع للمخزون.",
  "Mark the return as received?": "تأكيد استلام المرتجع؟",
  "{{n}} pieces go back into stock. If some arrived damaged, use Returns on the Stock page to write them off instead.":
    "{{n}} قطعة تعود للمخزون. إذا وصل بعضها تالفًا، استخدم المرتجعات في صفحة المخزون لشطبها.",
  "Write off the return as lost?": "شطب المرتجع كمفقود؟",
  "{{n}} pieces never arrived. They're written off at the cost they shipped with.":
    "{{n}} قطعة لم تصل. تُشطب بالتكلفة التي شُحنت بها.",
  "Written off as lost": "تم الشطب كمفقود",
  "Not posted to WhatsApp": "لم يُنشر على واتساب",
  "Draft restored, saved {{time}}": "تمت استعادة المسودة، حُفظت {{time}}",
  OK: "تمام",
  "Discard draft": "حذف المسودة",
  "Close this order?": "إغلاق هذا الطلب؟",
  "Keep it as a draft to finish later on this device, or discard what you entered.":
    "احتفظ به كمسودة لإكماله لاحقًا على هذا الجهاز، أو احذف ما أدخلته.",
  "What you entered will be lost.": "سيتم فقد ما أدخلته.",
  Discard: "حذف",
  "Keep draft": "الاحتفاظ بالمسودة",
  "Draft saved": "تم حفظ المسودة",
  "Discard this draft?": "حذف هذه المسودة؟",
  "Everything you entered is cleared and the form starts fresh.":
    "سيتم مسح كل ما أدخلته ويبدأ النموذج من جديد.",
  "Draft discarded": "تم حذف المسودة",
  // Boys / girls on order lines
  Boys: "أولادي",
  Girls: "بناتي",
  "Boys or girls": "أولادي أو بناتي",
  "Choose boys or girls": "اختر أولادي أو بناتي",
  // Movements, packing, returns, products (Pull 24)
  "Dates by": "التواريخ حسب",
  "Movement date": "تاريخ الحركة",
  "When it was recorded": "وقت التسجيل",
  "Recorded at": "وقت التسجيل",
  "Recorded {{when}} by {{name}}": "سُجلت {{when}} بواسطة {{name}}",
  "{{n}} pieces": "{{n}} قطع",
  "Already recorded as in transit: tick what arrived": "مسجّل بالفعل كمرتجع في الطريق: علّم على اللي وصل",
  "Anything else that came back:": "أي حاجة تانية رجعت:",
  "{{item}} arrived": "وصل {{item}}",
  "Most per website order (optional)": "الحد الأقصى في طلب الموقع (اختياري)",
  "For limited stock: a customer can't put more than this in one order, all sizes and colors together. Leave empty for no limit.":
    "للمخزون المحدود: العميل لا يقدر يطلب أكتر من كده في الطلب الواحد، لكل المقاسات والألوان مع بعض. اتركه فاضي لعدم وجود حد.",
  "Website shipping fee by governorate": "مصاريف شحن طلبات الموقع حسب المحافظة",
  "Added to website orders from the governorate the customer picks. You can change it per order when you confirm it with the customer.":
    "تُضاف لطلبات الموقع حسب المحافظة التي يختارها العميل. يمكنك تعديلها لكل طلب عند تأكيده مع العميل.",
  // Same item twice (one boys line, one girls line), app updates
  "Already added for {{gender}} on line {{n}}: change that line's quantity instead":
    "مضاف بالفعل لـ{{gender}} في السطر {{n}}: عدّل كمية ذلك السطر بدلًا من ذلك",
  "Already added on line {{n}}: change that line's quantity instead": "مضاف بالفعل في السطر {{n}}: عدّل كمية ذلك السطر بدلًا من ذلك",
  "Already on another line: change that line's quantity": "موجود في سطر آخر: عدّل كمية ذلك السطر",
  "A new version of the app is ready": "يوجد إصدار جديد من التطبيق",
  Reload: "إعادة التحميل",
  "1 piece": "قطعة واحدة",
  // Delayed orders (the customer asked to ship later)
  "Delayed · ship on {{day}}": "مؤجَّل · الشحن يوم {{day}}",
  Delayed: "مؤجَّل",
  "Delay shipping": "تأجيل الشحن",
  "Change ship date": "تغيير موعد الشحن",
  "{{order}} stays in the packing queue with a big Delayed label and this date.": "يبقى {{order}} في قائمة التجهيز مع علامة «مؤجَّل» كبيرة وهذا التاريخ.",
  "No longer delayed": "لم يعد مؤجَّلًا",
  "Not delayed anymore": "إلغاء التأجيل",
  "Customer wants it shipped on {{day}}": "العميل يريد الشحن يوم {{day}}",
  "Correct the price": "تصحيح السعر",
  "Enter the right total": "أدخل الإجمالي الصحيح",
  "For an order recorded at the wrong price when the courier collects the right one. The order keeps its shipment, items and stock; the books record the difference today.":
    "لطلب سُجّل بسعر خاطئ بينما تحصّل شركة الشحن السعر الصحيح. يحتفظ الطلب بشحنته وقطعه ومخزونه، وتسجّل الدفاتر الفرق اليوم.",
  "Now: {{total}} · sales {{change}}": "الحالي: {{total}} · المبيعات {{change}}",
  "Now: {{total}}": "الحالي: {{total}}",
  "Price corrected to {{total}}": "تم تصحيح السعر إلى {{total}}",
  "Recorded at the wrong price": "سُجّل بسعر خاطئ",
  "Right total (without shipping)": "الإجمالي الصحيح (بدون الشحن)",
  "Say why the price changed": "اذكر سبب تغيير السعر",
  "That's already the order's total": "هذا هو إجمالي الطلب بالفعل",
  "Customer asked to delay shipping": "العميل طلب تأجيل الشحن",
  "Leave off for a normal order.": "اتركه مغلقًا للطلب العادي.",
  "Packed like any other order, with a big Delayed label and this date. Switch off to ship as usual.": "يُجهَّز كأي طلب آخر، مع علامة «مؤجَّل» كبيرة وهذا التاريخ. أغلقه للشحن المعتاد.",
  "Choose the day to ship, or switch the delay off": "اختر يوم الشحن، أو أغلق التأجيل",
  "Waiting for returned pieces": "في انتظار القطع المرتجعة",
  "The courier collected {{collected}} for the pieces kept. This return closes the {{rest}} still open, whatever pieces came back.": "حصّلت شركة الشحن {{collected}} عن القطع المستلمة. هذا المرتجع يُغلق المتبقي {{rest}} أيًا كانت القطع التي رجعت.",
  "Not enough free stock yet, don't pack: {{items}}": "لا يوجد مخزون متاح كافٍ بعد، لا تجهّزه: {{items}}",
  "{{item}} ({{free}} of {{needed}} free)": "{{item}} (متاح {{free}} من {{needed}})",
  "Delayed by the customer ({{n}}): ship on the date shown": "مؤجَّلة بطلب العميل ({{n}}): اشحن في التاريخ الموضح",
  "{{n}} days ago": "منذ {{n}} يوم",
  "in {{n}} days": "بعد {{n}} أيام",
  today: "اليوم",
  tomorrow: "غدًا",
  "Enter a valid ship date": "أدخل تاريخ شحن صحيحًا",
  "The ship date must be after today": "يجب أن يكون تاريخ الشحن بعد اليوم",
  "Choose the day to ship": "اختر يوم الشحن",
  "Now: {{day}}": "الحالي: {{day}}",
  "Save date": "حفظ الموعد",
  "Ship date set to {{day}}": "تم تحديد الشحن يوم {{day}}",
  "Ship on": "الشحن يوم",
};
