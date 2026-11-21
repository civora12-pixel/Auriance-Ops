// English singular forms for plural keys in the orders area ("{{count}} orders" → "{{count}} orders_one").
export const orders: Record<string, string> = {
  "{{count}} units_one": "{{count}} unit",
  "{{count}} lines_one": "{{count}} line",
  "Exported {{count}} orders_one": "Exported {{count}} order",
  "{{count}} orders marked as paid_one": "{{count}} order marked as paid",
  "{{count}} orders marked as paid ({{skipped}} skipped: already paid or cancelled)_one":
    "{{count}} order marked as paid ({{skipped}} skipped: already paid or cancelled)",
  "Record payment for {{count}} selected orders._one":
    "Record payment for {{count}} selected order.",
  "{{count}} units will be taken out of stock and the order marked as shipped._one":
    "{{count}} unit will be taken out of stock and the order marked as shipped.",
  "{{count}} units shipped. {{rest}} still to ship._one":
    "{{count}} unit shipped. {{rest}} still to ship.",
  "Ship {{count}} units_one": "Ship {{count}} unit",
};
