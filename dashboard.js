console.log("Dashboard Script is starting..."); // ADD THIS
import { db } from './firebase-config.js';
console.log("Database connection successful:", db); // ADD THIS
import { collection, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
// Data Storage (Added 'purchases' array here)
let salesOrders = [], prodOrders = [], workers = [], expenses = [], invoices = [], receipts = [], purchases = [], salaries = [];
let articles = [];
function formatMoney(amount) {
    // If amount is undefined, null, or not a number, return ₹0.00
    if (isNaN(amount) || amount === null || amount === undefined) {
        return "₹0.00";
    }
    // Force to a number before formatting
    return Number(amount).toLocaleString('en-IN', {
        style: 'currency',
        currency: 'INR'
    });
}

const today = new Date();
// document.getElementById('view-month').value = today.toISOString().slice(0, 7);

window.renderDashboard = async function () {
    // 1. Get the Range Values from your new inputs
    const startVal = document.getElementById('filter-start').value; // e.g., "2026-01"
    const endVal = document.getElementById('filter-end').value;     // e.g., "2026-12"

    // Safety check: if inputs are empty, don't run the filters
    if (!startVal || !endVal) return;

    // --- NEW RANGE-BASED FILTERS ---

    // 1. Sales Orders & Production (With Status Checks)
    const mSO = salesOrders.filter(x => {
        const month = x.date ? x.date.substring(0, 7) : "";
        return month >= startVal && month <= endVal && x.qty > 0 && x.status !== 'Completed';
    });

    const mPO = prodOrders.filter(x => {
        const month = x.date ? x.date.substring(0, 7) : "";
        return month >= startVal && month <= endVal && x.qty > 0 && x.status !== 'Completed';
    });

    // 2. The Rest of the Financial Data
    const mWorkers   = workers.filter(x => x.date?.substring(0, 7) >= startVal && x.date?.substring(0, 7) <= endVal);
    const mExpenses  = expenses.filter(x => x.date?.substring(0, 7) >= startVal && x.date?.substring(0, 7) <= endVal);
    const mInvoices  = invoices.filter(x => x.date?.substring(0, 7) >= startVal && x.date?.substring(0, 7) <= endVal);
    const mReceipts  = receipts.filter(x => x.date?.substring(0, 7) >= startVal && x.date?.substring(0, 7) <= endVal);
    const mPurchases = purchases.filter(x => x.date?.substring(0, 7) >= startVal && x.date?.substring(0, 7) <= endVal);
    const mSalaries  = salaries.filter(x => x.date?.substring(0, 7) >= startVal && x.date?.substring(0, 7) <= endVal);

    // --- NEW SAFE HELPER ---
    // Failsafe: Ensures the app never crashes if the 'articles' array isn't loaded yet
    const formatArticleName = (code) => {
        try {
            // Looks for your global master articles array (assuming it's named 'articles')
            if (typeof articles !== 'undefined' && Array.isArray(articles)) {
                const art = articles.find(a => a.code === code);
                if (art) return `${art.name} [${code}]`;
            }
        } catch (e) { console.error("Name lookup skipped:", e); }
        return code; // Fallback: Just show the code if the name can't be found
    };

    // --- REPORT C: SALES SUMMARY ---
    const totalInvoiced = mInvoices.reduce((sum, item) => sum + item.total, 0);
    const totalReceived = mReceipts.reduce((sum, item) => sum + item.amount, 0);
    document.getElementById('rep-sales').innerText = formatMoney(totalInvoiced);
    document.getElementById('rep-received').innerText = formatMoney(totalReceived);
    document.getElementById('rep-outstanding').innerText = formatMoney(totalInvoiced - totalReceived);

    // --- EXECUTIVE P&L SYNC ---
    const totalWorkerPay = mWorkers.reduce((sum, w) => sum + (parseFloat(w.total) || 0), 0);
    const totalShopExp = mExpenses.reduce((sum, ex) => sum + (parseFloat(ex.amount) || 0), 0);
    const totalMaterials = mPurchases.reduce((sum, p) => sum + (parseFloat(p.total) || 0), 0);
    const totalSalaries = mSalaries.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);

    const totalCosts = totalWorkerPay + totalShopExp + totalMaterials + totalSalaries;
    const netProfit = totalInvoiced - totalCosts;
    const ownerShare = netProfit / 2;

    document.getElementById('pl-revenue').innerText = formatMoney(totalInvoiced);
    document.getElementById('pl-costs').innerText = formatMoney(totalCosts);
    document.getElementById('pl-profit').innerText = formatMoney(netProfit);
    document.getElementById('pl-owner-share').innerText = formatMoney(ownerShare);

    document.getElementById('pl-profit').style.color = netProfit < 0 ? '#d32f2f' : '#2e7d32';
    document.getElementById('pl-owner-share').style.color = ownerShare < 0 ? '#d32f2f' : '#2e7d32';

    // --- REPORT A: ARTICLE-WISE REPORT ---
    const articleStats = {};
    mSO.forEach(so => { articleStats[so.article] = articleStats[so.article] || { o: 0, p: 0, s: 0 }; articleStats[so.article].o += so.qty; });
    mPO.forEach(po => { articleStats[po.article] = articleStats[po.article] || { o: 0, p: 0, s: 0 }; articleStats[po.article].p += po.qty; });
    mInvoices.forEach(inv => { articleStats[inv.article] = articleStats[inv.article] || { o: 0, p: 0, s: 0 }; articleStats[inv.article].s += inv.qty; });

    const artTbody = document.getElementById('rep-article-wise');
    artTbody.innerHTML = '';
    for (const [art, data] of Object.entries(articleStats)) {
        // INJECTED HELPER HERE
        artTbody.innerHTML += `<tr><td><strong>${formatArticleName(art)}</strong></td><td>${data.o}</td><td>${data.p}</td><td>${data.s}</td></tr>`;
    }

    // --- REPORT B: COSTING REPORT (Labor per article) ---
    const laborCosts = {};
    mWorkers.forEach(w => { laborCosts[w.article] = (laborCosts[w.article] || 0) + w.total; });
    const costTbody = document.getElementById('rep-costing');
    costTbody.innerHTML = '';
    for (const [art, cost] of Object.entries(laborCosts)) {
        // INJECTED HELPER HERE
        costTbody.innerHTML += `<tr><td><strong>${formatArticleName(art)}</strong></td><td class="amount-neg">${formatMoney(cost)}</td></tr>`;
    }

    // --- REPORT C (Extended): EXPENSE SUMMARY ---
    const expStats = {};
    window.currentReceiptsMap = {};

    mExpenses.forEach(ex => {
        expStats[ex.head] = (expStats[ex.head] || 0) + (parseFloat(ex.amount) || 0);
        if (ex.receiptUrl) {
            if (!window.currentReceiptsMap[ex.head]) window.currentReceiptsMap[ex.head] = [];
            window.currentReceiptsMap[ex.head].push({ url: ex.receiptUrl, date: ex.date, supplier: ex.desc });
        }
    });

    if (totalSalaries > 0) {
        expStats['Staff Salaries'] = totalSalaries;
        mSalaries.forEach(s => {
            if (s.receiptUrl) {
                if (!window.currentReceiptsMap['Staff Salaries']) window.currentReceiptsMap['Staff Salaries'] = [];
                window.currentReceiptsMap['Staff Salaries'].push({ url: s.receiptUrl, date: s.date, supplier: `${s.name} - ${s.month}` });
            }
        });
    }

    mPurchases.forEach(p => {
        const materialLabel = p.type ? `Material - ${p.type}` : 'Raw Materials';
        expStats[materialLabel] = (expStats[materialLabel] || 0) + (parseFloat(p.total) || 0);
        if (p.receiptUrl) {
            if (!window.currentReceiptsMap[materialLabel]) window.currentReceiptsMap[materialLabel] = [];
            window.currentReceiptsMap[materialLabel].push({ url: p.receiptUrl, date: p.date, supplier: p.supplier });
        }
    });

    mWorkers.forEach(w => {
        const workerLabel = `Labor - ${w.worker}`;
        expStats[workerLabel] = (expStats[workerLabel] || 0) + (parseFloat(w.total) || 0);
        if (w.receiptUrl) {
            if (!window.currentReceiptsMap[workerLabel]) window.currentReceiptsMap[workerLabel] = [];
            window.currentReceiptsMap[workerLabel].push({ url: w.receiptUrl, date: w.date, supplier: `Article: ${w.article}` });
        }
    });

    const expTbody = document.getElementById('rep-expenses');
    expTbody.innerHTML = '';
    for (const [head, amt] of Object.entries(expStats)) {
        let rowHtml = `<tr><td>${head.replace('EXP-', '')}</td>`;
        let iconHtml = '';
        if (window.currentReceiptsMap[head] && window.currentReceiptsMap[head].length > 0) {
            iconHtml = `<button class="view-btn no-print" onclick="openReceiptModal('${head}')" title="View Receipts">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 18px; height: 18px; color: #777; transition: color 0.2s;">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </button>`;
        }
        rowHtml += `<td class="amount-neg">${formatMoney(amt)} ${iconHtml}</td></tr>`;
        expTbody.innerHTML += rowHtml;
    }
    // --- REPORT D: INCOMING PAYMENTS LEDGER ---
    const recTbody = document.getElementById('rep-receipts');
    recTbody.innerHTML = '';

    // Loop through the filtered receipts and build the rows
    mReceipts.forEach(r => {
        let iconHtml = '';

        // If they uploaded a screenshot, wire it up to the modal!
        if (r.receiptUrl) {
            const head = `Payment: ${r.client}`; // Title for the modal

            if (!window.currentReceiptsMap[head]) window.currentReceiptsMap[head] = [];
            // Pass the Mode and Invoice No as the "Supplier" text in the modal
            window.currentReceiptsMap[head].push({
                url: r.receiptUrl,
                date: r.date,
                supplier: `Mode: ${r.mode} | Inv: ${r.invoiceNo}`
            });

            iconHtml = `<button class="view-btn no-print" onclick="openReceiptModal('${head}')" title="View Proof">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 18px; height: 18px; color: #777; transition: color 0.2s;">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </button>`;
        }

        // Add the row to the table (Formatting the text green since it's income!)
        recTbody.innerHTML += `<tr>
                    <td>${new Date(r.date).toLocaleDateString('en-IN')}</td>
                    <td>${r.client}</td>
                    <td>${r.invoiceNo}</td>
                    <td style="text-align: right; color: #2e7d32; font-weight: bold;">
                        ${formatMoney(r.amount)} ${iconHtml}
                    </td>
                </tr>`;
    });
    // ==========================================
    // --- REPORT E: ACTIVE SALES ORDERS ---
    // ==========================================
    const soTbody = document.getElementById('dash-so-list');
    if (soTbody) {
        let soHtml = ''; // 1. Create a blank canvas
        
        if (mSO.length === 0) {
            soHtml = '<tr><td colspan="5" style="text-align:center; color:#888;">No sales orders.</td></tr>';
        } else {
            mSO.forEach(so => {
                const total = (so.qty || 0) * (so.rate || 0);
                soHtml += `
                    <tr>
                        <td><strong>${so.orderNo || 'N/A'}</strong></td>
                        <td>${so.client || 'Unknown'}</td>
                        <td>${formatArticleName(so.article)}</td>
                        <td>${so.qty || 0}</td>
                        <td style="text-align: right; color: #2e7d32; font-weight: bold;">${formatMoney(total)}</td>
                    </tr>
                `;
            });
        }
        soTbody.innerHTML = soHtml; // 2. Stamp it to the screen all at once!
    }

    // ==========================================
    // --- REPORT F: FACTORY FLOOR STATUS ---
    // ==========================================
    const poTbody = document.getElementById('dash-po-list');
    if (poTbody) {
        let poHtml = ''; // 1. Create a blank canvas
        
        if (mPO.length === 0) {
            poHtml = '<tr><td colspan="4" style="text-align:center; color:#888;">No production jobs active.</td></tr>';
        } else {
            mPO.forEach(po => {
                const dateStr = po.date ? new Date(po.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'No Date';
                poHtml += `
                    <tr>
                        <td>${dateStr}</td>
                        <td><strong>${po.worker || 'Unassigned'}</strong></td>
                        <td>
                            ${formatArticleName(po.article)}<br>
                            <span style="font-size: 11px; color: #888; text-transform: uppercase;">Link: ${po.linkedSO || 'Stock'}</span>
                        </td>
                        <td>${po.qty || 0} units</td>
                    </tr>
                `;
            });
        }
        poTbody.innerHTML = poHtml; // 2. Stamp it to the screen!
    }
};
window.openReceiptModal = function (categoryHead) {
    const receipts = window.currentReceiptsMap[categoryHead] || [];
    const grid = document.getElementById('modal-grid');
    document.getElementById('modal-title').innerText = `Receipts for ${categoryHead.replace('EXP-', '')}`;
    grid.innerHTML = '';
    if (receipts.length === 0) {
        grid.innerHTML = '<p>No receipts found for this category.</p>';
    } else {
        receipts.forEach(r => {
            // Formats date nicely
            const dateFmt = new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            grid.innerHTML += `
                        <div class="receipt-card">
                            <a href="${r.url}" target="_blank">
                                <img src="${r.url}" alt="Receipt">
                            </a>
                            <div style="font-size: 12px; margin-top: 5px; font-weight: bold;">${dateFmt}</div>
                            <div style="font-size: 11px; color: #666;">${r.supplier || ''}</div>
                        </div>
                    `;
        });
    }

    openModal('receipt-modal');
};
// --- SIDEBAR & DROPDOWN LOGIC ---

// Opens/Closes the whole sidebar
window.toggleSidebar = function () {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('open');
};

// Opens/Closes the Financials dropdown
window.toggleDropdown = function () {
    const menu = document.getElementById('financials-menu');
    const arrow = document.getElementById('dropdown-arrow');

    menu.classList.toggle('show');
    arrow.classList.toggle('rotate');
};
// Opens/Closes the Master Data dropdown
window.toggleMasterDropdown = function () {
    document.getElementById('master-menu').classList.toggle('show');
    document.getElementById('master-arrow').classList.toggle('rotate');
};

// Opens/Closes the Production dropdown
window.toggleProductionDropdown = function () {
    const menu = document.getElementById('production-menu');
    const arrow = document.getElementById('production-arrow');
    
    if (menu && arrow) {
        menu.classList.toggle('show');
        arrow.classList.toggle('rotate');
    }
};
// Listeners (Added the erp_purchases listener here at the bottom)
onSnapshot(collection(db, "sales_orders"), (snap) => { salesOrders = snap.docs.map(d => d.data()); window.renderDashboard(); });
onSnapshot(collection(db, "production_orders"), (snap) => { prodOrders = snap.docs.map(d => d.data()); window.renderDashboard(); });
onSnapshot(collection(db, "erp_worker_payments"), (snap) => {
    workers = snap.docs.map(d => d.data());
    window.renderDashboard();
});
onSnapshot(collection(db, "erp_expenses"), (snap) => { expenses = snap.docs.map(d => d.data()); window.renderDashboard(); });
onSnapshot(collection(db, "erp_invoices"), (snap) => { invoices = snap.docs.map(d => d.data()); window.renderDashboard(); });
// --- NEW: Download Master Articles for the Dashboard ---
onSnapshot(collection(db, "master_articles"), (snap) => {
    articles = snap.docs.map(doc => doc.data());
    renderDashboard(); // Re-draw the dashboard once names are loaded!
});
onSnapshot(collection(db, "erp_receipts"), (snap) => { receipts = snap.docs.map(d => d.data()); window.renderDashboard(); });
onSnapshot(collection(db, "erp_purchases"), (snap) => {
    purchases = snap.docs.map(d => d.data());
    window.renderDashboard();
});
onSnapshot(collection(db, "erp_staff_salaries"), (snap) => { salaries = snap.docs.map(d => d.data()); window.renderDashboard(); });
// --- SMOOTH MODAL LOGIC ---

window.openModal = function(modalId) {
            // 1. CLEAR THE STAGE: Hide any modal cards that are currently open
            document.querySelectorAll('.modal-card').forEach(card => {
                card.classList.remove('show');
            });

            // 2. ENSURE OVERLAY: Make sure the blurred background is visible
            document.getElementById('global-overlay').classList.add('show');

            // 3. SHOW THE NEW ONE: Slide in the requested form
            const targetModal = document.getElementById(modalId);
            if (targetModal) {
                targetModal.classList.add('show');
            }

            // // 4. CLEAN UP UI: Close the dropdown menu after clicking an item
            // const financialMenu = document.getElementById('financials-menu');
            // if (financialMenu) financialMenu.classList.remove('show');
            
            const masterMenu = document.getElementById('master-menu');
            // if (masterMenu) masterMenu.classList.remove('show');

            // 5. MOBILE FIX: Close sidebar if on a phone
            const sidebar = document.getElementById('sidebar');
            if (sidebar && sidebar.classList.contains('open')) {
                // Assuming you have a toggleSidebar function
                toggleSidebar(); 
            }
        };

window.closeAllModals = function () {
    // Remove the 'show' class from everything
    document.getElementById('global-overlay').classList.remove('show');
    document.querySelectorAll('.modal-card').forEach(card => {
        card.classList.remove('show');
    });
};

function setDefaultDates() {
    const startInput = document.getElementById('filter-start');
    const endInput = document.getElementById('filter-end');

    if (startInput && endInput && !startInput.value) { // Only set if empty!
        const currentMonth = new Date().toISOString().slice(0, 7);
        startInput.value = currentMonth;
        endInput.value = currentMonth;
        
        // This is the ONLY time we trigger a render from here
        renderDashboard(); 
    }
}

// Only trigger on load
window.addEventListener('DOMContentLoaded', setDefaultDates);