// ==========================================================================
// Configuration URLs (แทนที่ด้วย URL จริงของคุณ)
// ==========================================================================
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_APPS_SCRIPT_ID/exec';
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/YOUR_PUBLISHED_SHEET_ID/pub?output=csv';

// ==========================================================================
// Main Router / Page Initializer
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  // 1. หน้าแสดงสินค้า (product.html)
  if (document.getElementById('product-list')) {
    initProductPage();
  }

  // 2. หน้าสั่งซื้อสินค้า (order.html)
  if (document.getElementById('orderForm')) {
    initOrderPage();
  }

  // 3. หน้าแอดมินดูรายการสั่งซื้อ (admin.html)
  if (document.querySelector('#ordersTable tbody')) {
    initAdminPage();
  }
});

// ==========================================================================
// 1. Product Page Logic (product.html)
// ==========================================================================
async function initProductPage() {
  const filterBar = document.getElementById('filter-bar');
  const productList = document.getElementById('product-list');

  let allProducts = [];

  // ตัวเลือกปุ่มกรองตามที่กำหนด (รองรับการค้นหาแบบยืดหยุ่นให้ตรงกับ products.json)
  const filterOptions = [
    { label: 'ทั้งหมด', value: 'all' },
    { label: 'Fresh', value: 'fresh' },
    { label: 'Sweet', value: 'sweet' },
    { label: 'Confident', value: 'confident' },
    { label: 'Romance', value: 'romance' }
  ];

  // อ่านค่า ?mood=xxx จาก URL parameter
  const urlParams = new URLSearchParams(window.location.search);
  let activeMood = (urlParams.get('mood') || 'all').toLowerCase().trim();

  // สร้างปุ่มกรองใน #filter-bar
  function renderFilterButtons() {
    if (!filterBar) return;
    filterBar.innerHTML = '';

    filterOptions.forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = opt.label;
      btn.dataset.moodFilter = opt.value;

      // ตรวจสอบสถานะ active (รองรับทั้ง ?mood=fresh และ ?mood=apple fresh)
      const isSelected =
        activeMood === opt.value ||
        (opt.value !== 'all' && activeMood.includes(opt.value));

      btn.className = isSelected ? 'btn btn-sm btn-solid active' : 'btn btn-sm';

      btn.addEventListener('click', () => {
        activeMood = opt.value;
        // อัปเดต URL parameter โดยไม่รีโหลดหน้า
        const newUrl = new URL(window.location);
        if (opt.value === 'all') {
          newUrl.searchParams.delete('mood');
        } else {
          newUrl.searchParams.set('mood', opt.value);
        }
        window.history.replaceState({}, '', newUrl);

        renderFilterButtons();
        renderProducts();
      });

      filterBar.appendChild(btn);
    });
  }

  // แสดงรายการสินค้าในการ์ด
  function renderProducts() {
    productList.innerHTML = '';

    const filtered = allProducts.filter(product => {
      if (activeMood === 'all' || !activeMood) return true;
      const productMood = (product.mood || '').toLowerCase();
      // รองรับทั้งค่าตรงตัว (เช่น "apple fresh") และคำค้นสั้นๆ (เช่น "fresh", "sweet")
      return productMood === activeMood || productMood.includes(activeMood);
    });

    if (filtered.length === 0) {
      productList.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; padding: 3rem 0;">ไม่พบสินค้าในหมวดหมู่นี้</p>';
      return;
    }

    filtered.forEach(product => {
      const card = document.createElement('article');
      card.className = 'card';
      card.setAttribute('data-mood', (product.mood || '').toLowerCase());

      // สร้างข้อความชื่อสินค้าพร้อมขนาดสำหรับส่งไปหน้า order.html
      const itemFullName = `${product.name} (${product.size})`;
      const orderUrl = `order.html?item=${encodeURIComponent(itemFullName)}&price=${encodeURIComponent(product.price)}`;

      card.innerHTML = `
        <div class="card-img-wrap">
          <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)} ${escapeHtml(product.size)}" loading="lazy">
        </div>
        <div class="card-body">
          <div class="mood-indicator">
            <span class="mood-dot"></span>
            <span>${escapeHtml(product.mood)}</span>
          </div>
          <div class="mood-underline"></div>
          <h3>${escapeHtml(product.name)}</h3>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0.25rem 0 0.75rem;">ขนาด ${escapeHtml(product.size)}</p>
          <p>${escapeHtml(product.description || '')}</p>
          <div class="card-meta">
            <span class="price">฿${Number(product.price).toLocaleString()}</span>
            <a href="${orderUrl}" class="btn btn-sm">สั่งซื้อ</a>
          </div>
        </div>
      `;

      productList.appendChild(card);
    });
  }

  // โหลดข้อมูลจาก products.json
  try {
    const response = await fetch('products.json');
    if (!response.ok) throw new Error('ไม่สามารถโหลดไฟล์ products.json ได้');
    allProducts = await response.json();

    renderFilterButtons();
    renderProducts();
  } catch (error) {
    console.error('Error loading products:', error);
    productList.innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">เกิดข้อผิดพลาดในการโหลดรายการสินค้า</p>';
  }
}

// ==========================================================================
// 2. Order Page Logic (order.html)
// ==========================================================================
function initOrderPage() {
  const orderForm = document.getElementById('orderForm');
  const customerNameInput = document.getElementById('customerName');
  const contactInput = document.getElementById('contact');
  const itemsInput = document.getElementById('items');
  const totalInput = document.getElementById('total');
  const noteInput = document.getElementById('note');

  // อ่านค่า item และ price จาก URL parameter แล้วเติมลงฟอร์มทันที
  const urlParams = new URLSearchParams(window.location.search);
  const itemParam = urlParams.get('item');
  const priceParam = urlParams.get('price');

  if (itemParam && itemsInput) {
    itemsInput.value = itemParam;
  }

  if (priceParam && totalInput) {
    totalInput.value = priceParam;
  }

  // ส่งฟอร์มสั่งซื้อไปยัง Google Apps Script
  orderForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const submitBtn = orderForm.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'กำลังส่งคำสั่งซื้อ...';
    }

    const payload = {
      customerName: customerNameInput ? customerNameInput.value.trim() : '',
      contact: contactInput ? contactInput.value.trim() : '',
      items: itemsInput ? itemsInput.value.trim() : '',
      total: totalInput ? totalInput.value.trim() : '',
      note: noteInput ? noteInput.value.trim() : ''
    };

    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
      .then(() => {
        window.location.href = 'thankyou.html';
      })
      .catch(error => {
        console.error(error);
        alert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'ยืนยันสั่งซื้อ';
        }
      });
  });
}

// ==========================================================================
// 3. Admin Page Logic (admin.html)
// ==========================================================================
async function initAdminPage() {
  const tbody = document.querySelector('#ordersTable tbody');

  try {
    const response = await fetch(CSV_URL);
    if (!response.ok) throw new Error('ไม่สามารถดึงข้อมูล CSV ได้');
    const csvText = await response.text();

    const rows = parseCSV(csvText);

    // ตัดแถวหัวตาราง (index 0) และกรองแถวว่างออก
    const dataRows = rows.slice(1).filter(row => row.some(cell => cell.trim() !== ''));

    // เรียงจากรายการล่าสุดขึ้นก่อน
    dataRows.reverse();

    tbody.innerHTML = '';

    if (dataRows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">ยังไม่มีรายการสั่งซื้อ</td></tr>';
      return;
    }

    dataRows.forEach(row => {
      const tr = document.createElement('tr');
      // คอลัมน์ A-F: วันเวลา, ชื่อลูกค้า, เบอร์โทร/Line, รายการสินค้า, จำนวนเงินรวม, หมายเหตุ
      for (let i = 0; i < 6; i++) {
        const td = document.createElement('td');
        td.textContent = row[i] !== undefined ? row[i] : '';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });
  } catch (error) {
    console.error('Error loading orders CSV:', error);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">เกิดข้อผิดพลาดในการโหลดข้อมูลคำสั่งซื้อ</td></tr>';
  }
}

// ==========================================================================
// Custom CSV Parser (รองรับเครื่องหมายคำพูด "..." และขึ้นบรรทัดใหม่ในช่อง)
// ==========================================================================
function parseCSV(text) {
  const rows = [];
  let currentRow = [];
  let currentVal = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentVal += '"';
        i++; // ข้ามเครื่องหมายคำพูดซ้อน
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentVal += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentVal.trim());
        currentVal = '';
      } else if (char === '\r' && nextChar === '\n') {
        currentRow.push(currentVal.trim());
        rows.push(currentRow);
        currentRow = [];
        currentVal = '';
        i++;
      } else if (char === '\n' || char === '\r') {
        currentRow.push(currentVal.trim());
        rows.push(currentRow);
        currentRow = [];
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
  }

  // เก็บข้อมูลตัวสุดท้าย
  if (currentVal !== '' || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    rows.push(currentRow);
  }

  return rows;
}

// ==========================================================================
// Helper: Escape HTML ป้องกัน XSS
// ==========================================================================
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
