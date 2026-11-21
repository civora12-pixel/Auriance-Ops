// Customer shop checkout, and website orders on the team side
export const checkout: Record<string, string> = {
  // Shop
  Cart: "السلة",
  "Your details": "بياناتك",
  "Checkout steps": "خطوات إتمام الطلب",
  Boy: "ولد",
  Girl: "بنت",
  "For a boy or a girl?": "لولد أم لبنت؟",
  "Choose boy or girl": "اختر ولد أو بنت",
  "You pay cash on delivery. We'll confirm your order on WhatsApp.":
    "الدفع نقدًا عند الاستلام. سنؤكد طلبك على واتساب.",
  Checkout: "إتمام الطلب",
  "Enter your delivery address": "أدخل عنوان التوصيل",
  "Delivery details": "بيانات التوصيل",
  "Have an account?": "لديك حساب؟",
  "to fill this in for you.": "لملء هذه البيانات تلقائيًا.",
  "Notes for us": "ملاحظات لنا",
  "Save these details to my account": "احفظ هذه البيانات في حسابي",
  "Back to cart": "العودة إلى السلة",
  Continue: "متابعة",
  "Check and place your order": "راجع طلبك وأكّده",
  "Cash on delivery. We'll message you on WhatsApp to confirm before we ship. Shipping may change slightly by area; we'll tell you when we confirm.":
    "الدفع عند الاستلام. سنراسلك على واتساب للتأكيد قبل الشحن. قد يختلف الشحن قليلًا حسب المنطقة، وسنخبرك عند التأكيد.",
  "Place order · {{total}}": "تأكيد الطلب · {{total}}",
  "Hi, I'm {{name}}. I just placed order {{number}} on the website ({{total}}, cash on delivery). Please confirm it.":
    "مرحبًا، أنا {{name}}. طلبت الآن الطلب {{number}} من الموقع ({{total}}، الدفع عند الاستلام). برجاء تأكيده.",
  "Thank you, {{name}}!": "شكرًا {{name}}!",
  "Your order number is": "رقم طلبك",
  "Total {{total}}, paid in cash when it arrives. We'll message you on WhatsApp to confirm it before we ship.":
    "الإجمالي {{total}}، يُدفع نقدًا عند الاستلام. سنراسلك على واتساب لتأكيده قبل الشحن.",
  "Confirm on WhatsApp": "أكّد على واتساب",

  // Team side
  Website: "الموقع",
  "Needs confirmation": "بانتظار التأكيد",
  "Enter a valid shipping fee": "أدخل مصاريف شحن صحيحة",
  "Order confirmed. It's in the packing queue now.": "تم تأكيد الطلب. أصبح في قائمة التجهيز الآن.",
  "Website order: needs confirmation": "طلب من الموقع: بانتظار التأكيد",
  "Message the customer to confirm, then add the shipment number. It can't be packed or shipped before that.":
    "راسل العميل للتأكيد، ثم أضف رقم الشحنة. لا يمكن تجهيزه أو شحنه قبل ذلك.",
  "Message customer on WhatsApp": "راسل العميل على واتساب",
  "Confirm order": "تأكيد الطلب",
  "Message {{phone}} on WhatsApp": "راسل {{phone}} على واتساب",
  Message: "مراسلة",
  "Website shipping fee": "مصاريف شحن طلبات الموقع",
  "Added to every website order. You can change it per order when you confirm it with the customer.":
    "تُضاف لكل طلب من الموقع. يمكنك تعديلها لكل طلب عند تأكيده مع العميل.",
  // Courier areas and the courier upload sheet
  Governorate: "المحافظة",
  "Governorate / city": "المحافظة / المدينة",
  "Choose a governorate": "اختر المحافظة",
  "Choose a city or area": "اختر المدينة أو المنطقة",
  "Choose the governorate first": "اختر المحافظة أولًا",
  "Choose your governorate from the list": "اختر محافظتك من القائمة",
  "Choose your city or area from the list": "اختر مدينتك أو منطقتك من القائمة",
  "Website orders → courier": "طلبات الموقع ← شركة الشحن",
  "1. Download the sheet and upload it on the courier's site. 2. Type the shipment numbers they give you below and confirm. The manual way still works.":
    "١. نزّل الشيت وارفعه على موقع شركة الشحن. ٢. اكتب أرقام الشحنات التي يعطونها لك هنا ثم أكّد. الطريقة اليدوية ما زالت متاحة.",
  "{{n}} website orders waiting · {{fresh}} not in a sheet yet": "{{n}} طلبات من الموقع في الانتظار · {{fresh}} لم تدخل شيت بعد",
  "Download courier sheet": "تنزيل شيت شركة الشحن",
  "Include orders already in an earlier sheet": "ضمّ الطلبات التي دخلت شيت سابق",
  "No website orders are waiting for confirmation.": "لا توجد طلبات من الموقع في انتظار التأكيد.",
  "No new website orders to export": "لا توجد طلبات جديدة من الموقع للتصدير",
  "{{n}} orders in the sheet": "{{n}} طلبات في الشيت",
  "{{n}} orders confirmed and sent to packing": "تم تأكيد {{n}} طلبات وإرسالها للتغليف",
  "In a sheet": "في شيت",
  "Shipment number for {{order}}": "رقم الشحنة للطلب {{order}}",
  "Confirm {{n}} orders": "تأكيد {{n}} طلبات",
  "Type shipment numbers to confirm": "اكتب أرقام الشحنات للتأكيد",
};
