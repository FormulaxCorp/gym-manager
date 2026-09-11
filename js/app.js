/* ============================================
   Gym Member Manager — App Controller
   ============================================ */
(function() {
  'use strict';

  const $ = (id) => document.getElementById(id);
  let currentFilter = '';

  // ---------- AUTH ----------
  function setupAuth() {
    const authScreen = $('auth-screen');
    const tabLogin = $('tabLogin'), tabRegister = $('tabRegister');

    function showForm(which) {
      $('loginForm').classList.toggle('hidden', which !== 'login');
      $('registerForm').classList.toggle('hidden', which !== 'register');
      tabLogin.classList.toggle('active', which === 'login');
      tabRegister.classList.toggle('active', which === 'register');
      $('authMsg').textContent = '';
    }
    tabLogin.onclick = () => showForm('login');
    tabRegister.onclick = () => showForm('register');

    async function doLogin() {
      const email = $('loginEmail').value.trim();
      const password = $('loginPassword').value;
      if (!email || !password) { $('authMsg').textContent = 'Email & password wajib diisi'; return; }
      $('loginBtn').disabled = true; $('loginBtn').textContent = '...';
      const r = await Auth.login(email, password);
      $('loginBtn').disabled = false; $('loginBtn').textContent = 'Masuk';
      if (r.success) { authScreen.classList.add('hidden'); $('app').classList.remove('hidden'); await boot(); }
      else $('authMsg').textContent = r.message;
    }
    async function doRegister() {
      const email = $('regEmail').value.trim();
      const password = $('regPassword').value;
      if (!email || password.length < 6) { $('authMsg').textContent = 'Email valid & password min. 6 karakter'; return; }
      $('registerBtn').disabled = true; $('registerBtn').textContent = '...';
      const r = await Auth.register(email, password);
      $('registerBtn').disabled = false; $('registerBtn').textContent = 'Daftar';
      if (r.success) {
        if (r.needsConfirm) { $('authMsg').textContent = 'Cek email untuk konfirmasi, lalu masuk lagi.'; }
        else { authScreen.classList.add('hidden'); $('app').classList.remove('hidden'); await boot(); }
      } else $('authMsg').textContent = r.message;
    }

    $('loginBtn').onclick = doLogin;
    $('registerBtn').onclick = doRegister;
    $('loginPassword').addEventListener('keypress', e => { if (e.key === 'Enter') doLogin(); });
    $('regPassword').addEventListener('keypress', e => { if (e.key === 'Enter') doRegister(); });
    $('logoutBtn').onclick = async () => {
      await Auth.logout();
      $('app').classList.add('hidden');
      authScreen.classList.remove('hidden');
    };

    Auth.init().then(user => {
      if (user) { authScreen.classList.add('hidden'); $('app').classList.remove('hidden'); boot(); }
      else { authScreen.classList.remove('hidden'); }
    });
  }

  async function boot() {
    await GymData.loadAllData();
    renderAll();
  }

  function renderAll() {
    renderDashboard();
    renderMembers();
    renderPaket();
    renderPayments();
    renderCheckin();
    renderLaporan();
    fillMemberPaketSelect();
    fillPaymentMemberSelect();
  }

  // ---------- NAV ----------
  function setupNav() {
    document.querySelectorAll('[data-page]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        const page = el.dataset.page;
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        $('page-' + page).classList.add('active');
        document.querySelectorAll('[data-page]').forEach(n => n.classList.remove('active'));
        document.querySelectorAll(`[data-page="${page}"]`).forEach(n => n.classList.add('active'));
      });
    });
    // modals close
    document.querySelectorAll('[data-close]').forEach(b => {
      b.addEventListener('click', () => $(b.dataset.close).classList.add('hidden'));
    });
    document.querySelectorAll('.modal').forEach(m => {
      m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); });
    });
    $('refreshBtn').onclick = async () => { $('refreshBtn').firstElementChild.classList.add('fa-spin'); await boot(); $('refreshBtn').firstElementChild.classList.remove('fa-spin'); };
  }

  // ---------- DASHBOARD ----------
  function renderDashboard() {
    const s = GymData.dashboardStats();
    $('dashStats').innerHTML = [
      statCard('Member Aktif', s.active, '#4caf50', 'fa-user-check'),
      statCard('Segera Kadaluarsa', s.expiring, '#ff7a1a', 'fa-hourglass-half'),
      statCard('Kadaluarsa', s.expired, '#f44336', 'fa-user-times'),
      statCard('Freeze', s.freeze, '#8ab4f8', 'fa-snowflake')
    ].join('');

    const exp = GymData.getMembers().filter(m => GymData.memberStatus(m) === 'expiring')
      .sort((a,b) => GymData.daysUntil(a.berakhir) - GymData.daysUntil(b.berakhir));
    $('dashExpiring').innerHTML = exp.length ? exp.map(m =>
      `<div class="mini-row"><span>${esc(m.nama)}</span><span class="tag tag-expiring">-${GymData.daysUntil(m.berakhir)}h</span></div>`
    ).join('') : emptyMini('Tidak ada — aman');

    const ghosts = GymData.ghostMembers();
    $('dashGhost').innerHTML = ghosts.length ? ghosts.map(m =>
      `<div class="mini-row"><span>${esc(m.nama)}</span><span class="tag tag-ghost">ghost</span></div>`
    ).join('') : emptyMini('Semua aktif datang');

    const mk = new Date().toISOString().slice(0,7);
    $('dashRevenue').innerHTML =
      `<div class="cash-num">${GymData.formatRp(GymData.revenueMonth(mk))}</div>` +
      `<div class="cash-sub">${new Date().toLocaleDateString('id-ID',{month:'long',year:'numeric'})} • ${GymData.getPayments().filter(p=>(p.tanggal||'').slice(0,7)===mk).length} transaksi</div>`;
  }
  const statCard = (label, val, color, icon) =>
    `<div class="stat-card"><div class="stat-ic" style="background:${color}22;color:${color}"><i class="fas ${icon}"></i></div><div><div class="stat-val">${val}</div><div class="stat-lab">${label}</div></div></div>`;
  const emptyMini = (t) => `<div class="mini-empty">${t}</div>`;

  // ---------- MEMBER ----------
  function renderMembers() {
    let list = GymData.getMembers();
    const q = ($('memberSearch').value || '').toLowerCase();
    if (q) list = list.filter(m => m.nama.toLowerCase().includes(q) || (m.noWa||'').includes(q));
    if (currentFilter) list = list.filter(m => GymData.memberStatus(m) === currentFilter);

    $('memberList').innerHTML = list.length ? list.map(m => {
      const st = GymData.memberStatus(m);
      const pkg = GymData.getPackage(m.paket);
      const du = GymData.daysUntil(m.berakhir);
      return `<div class="list-card" data-mid="${m.id}">
        <div class="lc-left">
          <div class="lc-name">${esc(m.nama)} ${m.freeze?'<span class="tag tag-freeze">freeze</span>':''}</div>
          <div class="lc-sub">${pkg?esc(pkg.nama):'-'} • s.d. ${GymData.formatDate(m.berakhir)} ${du<0?'':'('+du+'h)'}</div>
          ${m.noWa?`<div class="lc-wa"><i class="fab fa-whatsapp"></i> ${esc(m.noWa)}</div>`:''}
        </div>
        <div class="lc-actions">
          ${st==='expired'||st==='active'||st==='expiring'?`<button class="mini-btn act-extend" title="Perpanjang"><i class="fas fa-plus-circle"></i></button>`:''}
          <button class="mini-btn act-freeze" title="Freeze"><i class="fas fa-snowflake"></i></button>
          <button class="mini-btn act-edit" title="Edit"><i class="fas fa-pen"></i></button>
        </div>
      </div>`;
    }).join('') : `<div class="list-empty"><i class="fas fa-users"></i><p>Belum ada member</p><p class="sub">Klik + untuk tambah</p></div>`;

    // bind
    document.querySelectorAll('#memberList .list-card').forEach(card => {
      const id = card.dataset.mid;
      card.querySelector('.act-edit').onclick = () => openMemberModal(id);
      card.querySelector('.act-extend').onclick = () => doExtend(id);
      card.querySelector('.act-freeze').onclick = async () => { await GymData.toggleFreeze(id); renderAll(); };
      card.querySelector('.lc-wa')?.addEventListener('click', e => {
        e.stopPropagation();
        const m = GymData.getMember(id);
        window.open('https://wa.me/62' + (m.noWa||'').replace(/^0/,''), '_blank');
      });
    });
  }

  function openMemberModal(id) {
    const m = id ? GymData.getMember(id) : null;
    fillMemberPaketSelect(m?.paket);
    $('memberModalTitle').textContent = m ? 'Edit Member' : 'Tambah Member';
    $('mId').value = m?.id || '';
    $('mNama').value = m?.nama || '';
    $('mWa').value = m?.noWa || '';
    $('mMulai').value = m?.mulai || GymData.today();
    $('mNotes').value = m?.notes || '';
    $('mDelete').style.display = m ? '' : 'none';
    updateBerakhir();
    $('memberModal').classList.remove('hidden');
  }
  function fillMemberPaketSelect(sel) {
    $('mPaket').innerHTML = GymData.getPackages().map(p =>
      `<option value="${p.id}" ${p.id===sel?'selected':''}>${esc(p.nama)} — ${GymData.formatRp(p.harga)}</option>`).join('');
    $('mPaket').onchange = updateBerakhir;
    $('mMulai').onchange = updateBerakhir;
    if (sel) $('mPaket').value = sel;
  }
  function updateBerakhir() {
    const pkg = GymData.getPackage($('mPaket').value);
    const mulai = $('mMulai').value || GymData.today();
    $('mBerakhir').value = pkg ? GymData.formatDate(GymData.addMonths(mulai, pkg.durasiBulan)) : '-';
  }

  $('addMemberBtn').onclick = () => openMemberModal();
  $('memberSave').onclick = async () => {
    const nama = $('mNama').value.trim();
    if (!nama) { alert('Nama wajib diisi'); return; }
    const id = $('mId').value;
    const payload = { nama, noWa: $('mWa').value.trim(), notes: $('mNotes').value.trim() };
    let ok;
    if (id) {
      ok = await GymData.updateMember(id, payload);
    } else {
      payload.paket = $('mPaket').value; payload.mulai = $('mMulai').value || GymData.today();
      payload.berakhir = GymData.addMonths(payload.mulai, GymData.getPackage(payload.paket)?.durasiBulan || 1);
      payload.freeze = false;
      ok = await GymData.addMember(payload);
    }
    if (ok) { $('memberModal').classList.add('hidden'); renderAll(); }
  };
  $('mDelete').onclick = async () => {
    if (!confirm('Hapus member ini beserta seluruh riwayatnya?')) return;
    const id = $('mId').value;
    await GymData.deleteMember(id);
    $('memberModal').classList.add('hidden'); renderAll();
  };

  async function doExtend(id) {
    const m = GymData.getMember(id);
    const pkg = GymData.getPackage(m.paket);
    const base = (GymData.memberStatus(m)==='active'||GymData.memberStatus(m)==='expiring') ? m.berakhir : GymData.today();
    const newEnd = GymData.addMonths(base, pkg?.durasiBulan || 1);
    if (!confirm(`Perpanjang ${m.nama}?\n${pkg?pkg.nama:'paket'} +${pkg?.durasiBulan||1} bln → s.d. ${GymData.formatDate(newEnd)}`)) return;
    await GymData.extendMember(id, m.paket); renderAll();
  }
  $('memberSearch').oninput = renderMembers;
  $('memberFilter').onchange = e => { currentFilter = e.target.value; renderMembers(); };

  // ---------- PAKET ----------
  function renderPaket() {
    $('paketList').innerHTML = GymData.getPackages().map(p =>
      `<div class="list-card" data-pid="${p.id}">
        <div class="lc-left"><div class="lc-name">${esc(p.nama)}</div><div class="lc-sub">${p.durasiBulan} bulan ${p.note?'• '+esc(p.note):''}</div></div>
        <div class="lc-price">${GymData.formatRp(p.harga)}</div>
        <button class="mini-btn act-pedit" title="Edit"><i class="fas fa-pen"></i></button>
      </div>`).join('') || `<div class="list-empty"><i class="fas fa-ticket"></i><p>Belum ada paket</p></div>`;
    document.querySelectorAll('#paketList .list-card').forEach(c => {
      c.querySelector('.act-pedit').onclick = () => openPaketModal(c.dataset.pid);
    });
  }
  function openPaketModal(id) {
    const p = id ? GymData.getPackage(id) : null;
    $('paketModalTitle').textContent = p ? 'Edit Paket' : 'Tambah Paket';
    $('pId').value = p?.id || '';
    $('pNama').value = p?.nama || '';
    $('pDurasi').value = p?.durasiBulan || 1;
    $('pHarga').value = p?.harga || '';
    $('pNote').value = p?.note || '';
    $('pDelete').style.display = p ? '' : 'none';
    $('paketModal').classList.remove('hidden');
  }
  $('addPaketBtn').onclick = () => openPaketModal();
  $('pSave').onclick = async () => {
    const nama = $('pNama').value.trim();
    if (!nama) { alert('Nama paket wajib diisi'); return; }
    const payload = { nama, durasiBulan: parseInt($('pDurasi').value)||1, harga: parseFloat($('pHarga').value)||0, note: $('pNote').value.trim() };
    const id = $('pId').value;
    const ok = id ? await GymData.updatePackage(id, payload) : await GymData.addPackage(payload);
    if (ok) { $('paketModal').classList.add('hidden'); renderAll(); }
  };
  $('pDelete').onclick = async () => {
    if (!confirm('Hapus paket ini?')) return;
    await GymData.deletePackage($('pId').value);
    $('paketModal').classList.add('hidden'); renderAll();
  };

  // ---------- PEMBAYARAN ----------
  function renderPayments() {
    const mk = new Date().toISOString().slice(0,7);
    $('payTotalMonth').innerHTML = `<div class="cash-num">${GymData.formatRp(GymData.revenueMonth(mk))}</div>`;
    const list = GymData.getPayments().slice(0, 60);
    $('paymentList').innerHTML = list.length ? list.map(p => {
      const m = GymData.getMember(p.member_id);
      return `<div class="list-card pay-card">
        <div class="lc-left"><div class="lc-name">${m?esc(m.nama):'Member (hapus)'}</div>
        <div class="lc-sub">${GymData.formatDate(p.tanggal)} • ${esc(p.metode)} ${p.keterangan?'• '+esc(p.keterangan):''}</div></div>
        <div class="lc-price">${GymData.formatRp(p.nominal)}</div>
        <button class="mini-btn act-pdel" title="Hapus"><i class="fas fa-trash"></i></button>
      </div>`;
    }).join('') : `<div class="list-empty"><i class="fas fa-money-bill"></i><p>Belum ada pembayaran</p></div>`;
    document.querySelectorAll('#paymentList .act-pdel').forEach((b,i) => b.onclick = async () => { if(confirm('Hapus?')){ await GymData.deletePayment(list[i].id); renderAll(); } });
  }
  function fillPaymentMemberSelect(sel) {
    $('payMember').innerHTML = GymData.getMembers().map(m => `<option value="${m.id}" ${m.id===sel?'selected':''}>${esc(m.nama)}</option>`).join('') || '<option value="">— tidak ada member —</option>';
    if (sel) $('payMember').value = sel;
  }
  $('addPaymentBtn').onclick = () => {
    if (!GymData.getMembers().length) { alert('Tambah member dulu'); return; }
    fillPaymentMemberSelect();
    $('payTanggal').value = GymData.today();
    $('payNominal').value = '';
    $('payKet').value = '';
    $('payExtend').checked = true;
    $('paymentModal').classList.remove('hidden');
  };
  $('paySave').onclick = async () => {
    const memberId = $('payMember').value;
    const nominal = parseFloat($('payNominal').value) || 0;
    if (!memberId) { alert('Pilih member'); return; }
    if (nominal <= 0) { alert('Nominal harus > 0'); return; }
    const m = GymData.getMember(memberId);
    await GymData.addPayment({ member_id: memberId, tanggal: $('payTanggal').value, nominal, metode: $('payMetode').value, keterangan: $('payKet').value.trim() });
    if ($('payExtend').checked && m && m.paket) await GymData.extendMember(memberId, m.paket);
    $('paymentModal').classList.add('hidden'); renderAll();
  };

  // ---------- CHECK-IN ----------
  function renderCheckin() {
    const q = ($('checkinSearch').value || '').toLowerCase();
    let list = GymData.getMembers().filter(m => !q || m.nama.toLowerCase().includes(q)).slice(0, 30);
    const today = GymData.today();
    $('checkinResults').innerHTML = list.length ? list.map(m => {
      const st = GymData.memberStatus(m);
      const cnt = GymData.checkinCountFor(m.id, today);
      return `<div class="mini-row"><span>${esc(m.nama)} ${cnt>0?`<span class="tag tag-ok">✓${cnt}</span>`:''}</span>
      <button class="mini-btn cin-btn" data-cid="${m.id}" ${st==='expired'?'disabled title="Kadaluarsa"':''}><i class="fas fa-check"></i></button></div>`;
    }).join('') : emptyMini('Ketik nama member');
    document.querySelectorAll('#checkinResults .cin-btn').forEach(b => b.onclick = async () => { await GymData.addCheckin(b.dataset.cid); renderCheckin(); });

    const todayList = GymData.getCheckins().filter(c => c.tanggal === today);
    $('checkinToday').innerHTML = todayList.length ? todayList.map(c => {
      const m = GymData.getMember(c.member_id);
      return `<div class="mini-row"><span>${c.waktu} • ${m?esc(m.nama):'-'}</span><span class="tag tag-ok">in</span></div>`;
    }).join('') : emptyMini('Belum ada check-in hari ini');
  }
  $('checkinSearch').oninput = renderCheckin;

  // ---------- LAPORAN ----------
  function renderLaporan() {
    // populate month options from payments
    const months = new Set();
    GymData.getPayments().forEach(p => months.add((p.tanggal||'').slice(0,7)));
    months.add(new Date().toISOString().slice(0,7));
    const sel = $('reportMonth');
    const cur = sel.value || new Date().toISOString().slice(0,7);
    sel.innerHTML = [...months].sort().reverse().map(mk => {
      const [y,m] = mk.split('-');
      const label = new Date(y, m-1, 1).toLocaleDateString('id-ID',{month:'long',year:'numeric'});
      return `<option value="${mk}" ${mk===cur?'selected':''}>${label}</option>`;
    }).join('');
    sel.onchange = renderLaporan;

    const mk = sel.value;
    const pays = GymData.getPayments().filter(p => (p.tanggal||'').slice(0,7) === mk);
    const total = pays.reduce((s,p) => s + Number(p.nominal||0), 0);
    const s = GymData.dashboardStats();
    $('reportStats').innerHTML = [
      statCard('Pemasukan', GymData.formatRp(total), '#4caf50', 'fa-money-bill-wave'),
      statCard('Transaksi', pays.length, '#29b6f6', 'fa-receipt'),
      statCard('Member Aktif', s.active, '#ffb300', 'fa-user-check'),
      statCard('Kadaluarsa', s.expired, '#f44336', 'fa-user-times')
    ].join('');
    $('reportPayments').innerHTML = pays.length ? pays.map(p => {
      const m = GymData.getMember(p.member_id);
      return `<div class="mini-row"><span>${GymData.formatDate(p.tanggal)} • ${m?esc(m.nama):'-'} (${esc(p.metode)})</span><span class="tag tag-money">${GymData.formatRp(p.nominal)}</span></div>`;
    }).join('') : emptyMini('Tidak ada pembayaran bulan ini');
  }

  // ---------- UTIL ----------
  function esc(s) { return String(s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  setupAuth();
  setupNav();
})();
