import { jsPDF } from 'jspdf';

/** Brand colors (RGB) - Helvetica-safe PDF output */
const BRAND = {
    gold: [240, 178, 27],
    goldDark: [214, 158, 22],
    ink: [17, 24, 39],
    muted: [107, 114, 128],
    panel: [248, 249, 250],
    border: [229, 231, 235],
    white: [255, 255, 255]
};

const COMPANY = {
    name: 'Design Excellence',
    tagline: 'Office Furniture & Excellence',
    email: 'designexcellence1@gmail.com',
    phone: '(02) 413-6682',
    address: '#1 Binmaka St., Cor. Biak na Bato, Brgy. Manresa, Quezon City'
};

const MARGIN = 12;
const PAGE_H = 297;

/** ASCII-only money (jsPDF default fonts do not render PHP peso sign) */
const formatMoney = (amount) => {
    const n = Number(amount) || 0;
    const abs = Math.abs(n).toFixed(2);
    const [whole, dec] = abs.split('.');
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const formatted = `${grouped}.${dec}`;
    return n < 0 ? `-PHP ${formatted}` : `PHP ${formatted}`;
};

const formatDateTime = (value) => {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hr = h % 12 || 12;
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${hr}:${m} ${ampm}`;
};

const formatAddress = (address) => {
    if (!address) return '';
    if (typeof address === 'string') return address;
    return [
        address.houseNumber,
        address.street,
        address.barangay,
        address.city,
        address.province,
        address.postalCode,
        address.country || 'Philippines'
    ]
        .filter(Boolean)
        .join(', ');
};

const loadLogoDataUrl = () =>
    new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            } catch {
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        img.src = `${process.env.PUBLIC_URL || ''}/images/logo-design-excellence.png`;
    });

const strokeBox = (doc, x, y, w, h, radius = 1.5) => {
    doc.setDrawColor(...BRAND.border);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, y, w, h, radius, radius, 'S');
};

const fillBox = (doc, x, y, w, h, color, radius = 1.5) => {
    doc.setFillColor(...color);
    doc.roundedRect(x, y, w, h, radius, radius, 'F');
};

/**
 * @param {{ paymentDetails: object, orderItems: array, paymentMethodLabel?: string, paymentReference?: string }} params
 */
export async function downloadOrderInvoicePdf({
    paymentDetails,
    orderItems = [],
    paymentMethodLabel,
    paymentReference
}) {
    if (!paymentDetails) return;

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const contentW = pageW - MARGIN * 2;
    const right = pageW - MARGIN;
    let y = MARGIN;

    const logoDataUrl = await loadLogoDataUrl();
    const orderNum = paymentDetails.referenceNumber || paymentDetails.orderId || '-';
    const orderDate = formatDateTime(paymentDetails.completedAt);

    // --- Header ---
    const headerH = 26;
    fillBox(doc, MARGIN, y, contentW, headerH, BRAND.panel);
    strokeBox(doc, MARGIN, y, contentW, headerH);

    doc.setDrawColor(...BRAND.gold);
    doc.setLineWidth(1);
    doc.line(MARGIN, y, MARGIN, y + headerH);

    const logoX = MARGIN + 3;
    if (logoDataUrl) {
        try {
            doc.addImage(logoDataUrl, 'PNG', logoX, y + 4, 36, 18);
        } catch {
            /* fallback text */
        }
    }

    const brandX = logoDataUrl ? logoX + 40 : MARGIN + 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...BRAND.ink);
    doc.text(COMPANY.name.toUpperCase(), brandX, y + 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...BRAND.muted);
    doc.text(COMPANY.tagline, brandX, y + 14.5);
    doc.text(`${COMPANY.email} | ${COMPANY.phone}`, brandX, y + 18.5);
    doc.text(COMPANY.address, brandX, y + 22, { maxWidth: contentW - 95 });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...BRAND.goldDark);
    doc.text('INVOICE', right, y + 10, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.muted);
    doc.text(`Order #${orderNum}`, right, y + 15, { align: 'right' });
    doc.text(orderDate, right, y + 19.5, { align: 'right' });

    y += headerH + 5;

    // --- Bill To | Payment (two compact columns) ---
    const colW = (contentW - 4) / 2;
    const col2X = MARGIN + colW + 4;
    const infoH = 34;

    fillBox(doc, MARGIN, y, colW, infoH, BRAND.white);
    strokeBox(doc, MARGIN, y, colW, infoH);
    fillBox(doc, col2X, y, colW, infoH, BRAND.white);
    strokeBox(doc, col2X, y, colW, infoH);

    const drawSectionTitle = (title, x, startY) => {
        doc.setFillColor(...BRAND.gold);
        doc.rect(x, startY, colW, 6, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...BRAND.white);
        doc.text(title, x + 3, startY + 4.2);
    };

    drawSectionTitle('BILL TO', MARGIN, y);
    drawSectionTitle('PAYMENT', col2X, y);

    const customerName =
        paymentDetails.customerInfo?.name ||
        paymentDetails.customerNameFromStripe ||
        'Customer';
    const customerEmail = paymentDetails.customerEmail || paymentDetails.customerInfo?.email || '-';
    const addressStr = formatAddress(paymentDetails.address);
    const phone = paymentDetails.address?.phoneNumber;

    let ly = y + 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.ink);
    doc.text(customerName, MARGIN + 3, ly, { maxWidth: colW - 6 });
    ly += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...BRAND.muted);
    doc.text(customerEmail, MARGIN + 3, ly);
    ly += 4;
    if (addressStr) {
        const lines = doc.splitTextToSize(addressStr, colW - 6);
        doc.text(lines, MARGIN + 3, ly);
        ly += lines.length * 3.5;
    }
    if (phone) {
        doc.text(`Tel: ${phone}`, MARGIN + 3, ly);
    }

    const method = paymentMethodLabel || paymentDetails.method || 'E-Wallet';
    const payRef =
        paymentReference ||
        paymentDetails.paymentIntentId ||
        paymentDetails.transactionId ||
        '';
    const status = paymentDetails.paymentStatus || paymentDetails.status || 'Paid';
    const serviceType =
        paymentDetails.deliveryTypeName ||
        (paymentDetails.deliveryType === 'pickup' ? 'Pick up' : paymentDetails.deliveryType) ||
        '';

    const drawKv = (label, value, x, startY, w) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...BRAND.muted);
        doc.text(label, x + 3, startY);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...BRAND.ink);
        const valLines = doc.splitTextToSize(String(value || '-'), w - 6);
        doc.text(valLines, x + 3, startY + 3.5);
        return startY + 3.5 + valLines.length * 3.2 + 1.5;
    };

    let py = y + 10;
    py = drawKv('Method', method, col2X, py, colW);
    py = drawKv('Status', status, col2X, py, colW);
    if (payRef) py = drawKv('Reference', payRef, col2X, py, colW);
    if (serviceType) py = drawKv('Service', serviceType, col2X, py, colW);
    if (paymentDetails.pickupDate) {
        drawKv('Pickup', formatDateTime(paymentDetails.pickupDate), col2X, py, colW);
    }

    y += infoH + 5;

    // --- Line items table ---
    const colProductEnd = MARGIN + contentW * 0.52;
    const colQty = MARGIN + contentW * 0.58;
    const colUnit = MARGIN + contentW * 0.72;
    const colAmt = right;

    const drawTableHeader = (topY) => {
        doc.setFillColor(...BRAND.gold);
        doc.rect(MARGIN, topY, contentW, 7, 'F');
        strokeBox(doc, MARGIN, topY, contentW, 7, 0);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...BRAND.white);
        doc.text('PRODUCT', MARGIN + 3, topY + 4.8);
        doc.text('QTY', colQty, topY + 4.8);
        doc.text('UNIT PRICE', colUnit, topY + 4.8);
        doc.text('AMOUNT', colAmt - 3, topY + 4.8, { align: 'right' });
    };

    drawTableHeader(y);
    y += 7;

    const items = Array.isArray(orderItems) ? orderItems : [];
    const rowPad = 2;

    const renderItemRow = (item, idx) => {
        const name = item.ProductName || item.Name || 'Product';
        const variant = item.VariationName ? ` (${item.VariationName})` : '';
        const sku = item.SKU ? `SKU: ${item.SKU}` : '';
        const qty = parseInt(item.Quantity, 10) || 0;
        const unit = parseFloat(item.PriceAtPurchase) || 0;
        const lineTotal = unit * qty;

        const nameLines = doc.splitTextToSize(`${name}${variant}`, colProductEnd - MARGIN - 6);
        const rowH = Math.max(8, nameLines.length * 3.5 + (sku ? 4 : 0) + rowPad * 2);

        if (y + rowH > PAGE_H - 45) {
            doc.addPage();
            y = MARGIN;
            drawTableHeader(y);
            y += 7;
        }

        if (idx % 2 === 1) {
            fillBox(doc, MARGIN, y, contentW, rowH, BRAND.panel, 0);
        }
        doc.setDrawColor(...BRAND.border);
        doc.setLineWidth(0.15);
        doc.line(MARGIN, y + rowH, right, y + rowH);

        let textY = y + rowPad + 3;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...BRAND.ink);
        doc.text(nameLines, MARGIN + 3, textY);
        textY += nameLines.length * 3.5;
        if (sku) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.5);
            doc.setTextColor(...BRAND.muted);
            doc.text(sku, MARGIN + 3, textY);
        }

        const midY = y + rowH / 2 + 1;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...BRAND.ink);
        doc.text(String(qty), colQty, midY);
        doc.text(formatMoney(unit), colUnit, midY);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BRAND.goldDark);
        doc.text(formatMoney(lineTotal), colAmt - 3, midY, { align: 'right' });

        y += rowH;
    };

    if (items.length === 0) {
        const emptyH = 10;
        fillBox(doc, MARGIN, y, contentW, emptyH, BRAND.panel, 0);
        strokeBox(doc, MARGIN, y, contentW, emptyH);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(...BRAND.muted);
        doc.text('No line items available', MARGIN + 3, y + 6);
        y += emptyH;
    } else {
        items.forEach((item, idx) => renderItemRow(item, idx));
    }

    y += 4;

    // --- Totals (compact, right-aligned) ---
    const subtotal = Number(paymentDetails.subtotal) || 0;
    const shipping = Number(paymentDetails.deliveryCost) || Number(paymentDetails.shippingCost) || 0;
    const extraFee = Number(paymentDetails.extraDeliveryFee) || 0;
    const discount = Number(paymentDetails.discount) || 0;
    const total =
        Number(paymentDetails.amount) || Math.max(0, subtotal + shipping + extraFee - discount);

    const totalRows = [
        subtotal > 0 && { label: 'Subtotal', value: formatMoney(subtotal) },
        shipping > 0 && { label: 'Shipping', value: formatMoney(shipping) },
        extraFee > 0 && { label: 'Extra delivery', value: formatMoney(extraFee) },
        discount > 0 && { label: 'Discount', value: formatMoney(-discount) },
        { label: 'Total', value: formatMoney(total), bold: true }
    ].filter(Boolean);

    const totalsW = 72;
    const totalsH = 6 + totalRows.length * 6 + 4;
    const totalsX = right - totalsW;

    if (y + totalsH > PAGE_H - 20) {
        doc.addPage();
        y = MARGIN;
    }

    fillBox(doc, totalsX, y, totalsW, totalsH, BRAND.panel);
    strokeBox(doc, totalsX, y, totalsW, totalsH);

    let ty = y + 5;
    totalRows.forEach((row) => {
        if (row.bold) {
            doc.setDrawColor(...BRAND.gold);
            doc.setLineWidth(0.3);
            doc.line(totalsX + 3, ty - 2, totalsX + totalsW - 3, ty - 2);
            ty += 2;
        }
        doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
        doc.setFontSize(row.bold ? 10 : 8);
        doc.setTextColor(...(row.bold ? BRAND.ink : BRAND.muted));
        doc.text(row.label, totalsX + 4, ty);
        doc.setTextColor(...(row.bold ? BRAND.goldDark : BRAND.ink));
        doc.text(row.value, totalsX + totalsW - 4, ty, { align: 'right' });
        ty += row.bold ? 7 : 6;
    });

    y += totalsH + 6;

    // --- Footer ---
    doc.setDrawColor(...BRAND.border);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y, right, y);
    y += 4;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(...BRAND.muted);
    doc.text(
        'Thank you for your purchase. This is a computer-generated invoice from your order confirmation.',
        MARGIN,
        y,
        { maxWidth: contentW }
    );
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.text(`Support: ${COMPANY.email} | ${COMPANY.phone}`, MARGIN, y);

    const safeOrder = String(orderNum).replace(/[^a-zA-Z0-9-_]/g, '');
    doc.save(`Design-Excellence-Invoice-${safeOrder}.pdf`);
}
