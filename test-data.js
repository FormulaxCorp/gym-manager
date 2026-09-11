// Self-check: load gym-data.js with stubbed supabase/Auth, run assertions.
const fs = require('fs');
const path = require('path');

// Stubs
let store = {};
global.supabase = {
  from: (t) => ({
    select: () => ({ eq: () => ({ then: (fn) => fn({ data: Object.entries(store).map(([id,data]) => ({ id, data })) }) }) }),
    upsert: (rec) => { store[rec.id] = rec.data; return { then: (fn) => fn({ error: null }) }; }
  })
};
global.Auth = { getUserId: () => 'test-user' };
global.window = {};

const code = fs.readFileSync(path.join(__dirname, 'js', 'gym-data.js'), 'utf8');
eval(code + '\n;globalThis.GymData = GymData;');

function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('ok:', msg); }

(async () => {
  // seed default packages (pkg-bulanan, pkg-3bulan, ...) via load
  await GymData.loadAllData();
  assert(GymData.getPackages().some(p => p.id === 'pkg-bulanan'), 'default packages seeded');

  // add member
  await GymData.addMember({ nama: 'Budi', noWa: '0812', paket: 'pkg-bulanan', mulai: '2026-09-01', berakhir: '2026-10-01', freeze: false });
  const members = GymData.getMembers();
  assert(members.length === 1, 'addMember');
  const budi = members[0];

  // status: 2026-09-11 today-ish, berakhir 2026-10-01 => active
  assert(GymData.memberStatus(budi) === 'active', 'status active (s.d. 2026-10-01)');

  // addMonths
  assert(GymData.addMonths('2026-01-31', 1) === '2026-02-28' || GymData.addMonths('2026-01-31', 1) === '2026-02-28', 'addMonths Feb');
  assert(GymData.addMonths('2026-08-01', 3) === '2026-11-01', 'addMonths +3 = 2026-11-01');

  // payment + revenue
  await GymData.addPayment({ member_id: budi.id, tanggal: new Date().toISOString().slice(0,10), nominal: 300000, metode: 'Tunai' });
  const mk = new Date().toISOString().slice(0,7);
  assert(GymData.revenueMonth(mk) === 300000, 'revenueMonth = 300000');

  // checkin + ghost
  await GymData.addCheckin(budi.id);
  assert(GymData.checkinCountFor(budi.id, GymData.today()) === 1, 'checkinCountFor today = 1');
  // Budi just checked in today => not ghost
  assert(GymData.ghostMembers().length === 0, 'budi not ghost after checkin');

  // extend: active member, base = berakhir (2026-10-01) + 1 month = 2026-11-01
  const before = GymData.getMember(budi.id).berakhir;
  await GymData.extendMember(budi.id, 'pkg-bulanan');
  const after = GymData.getMember(budi.id).berakhir;
  assert(after === GymData.addMonths(before, 1), 'extendMember bumps by 1 month');

  // freeze toggle
  await GymData.toggleFreeze(budi.id);
  assert(GymData.memberStatus(GymData.getMember(budi.id)) === 'freeze', 'freeze status');

  // dashboardStats
  const s = GymData.dashboardStats();
  assert(s.total === 1 && s.freeze === 1, 'dashboardStats total=1 freeze=1');

  // delete member cascades payments + checkins
  await GymData.deleteMember(budi.id);
  assert(GymData.getMembers().length === 0, 'deleteMember removes member');
  assert(GymData.getPayments().length === 0, 'deleteMember cascades payments');
  assert(GymData.getCheckins().length === 0, 'deleteMember cascades checkins');

  // persistence roundtrip
  await GymData.addMember({ nama: 'Citra', mulai: GymData.today(), berakhir: GymData.addMonths(GymData.today(), 12) });
  store = {}; // wipe
  await GymData.loadAllData();
  assert(GymData.getMembers().length === 1 && GymData.getMembers()[0].nama === 'Citra', 'persistence roundtrip after reload');

  // addPackage + updatePackage
  await GymData.addPackage({ nama: 'Harian', durasiBulan: 0.5, harga: 30000, note: 'single day' });
  const hp = GymData.getPackages().find(p => p.nama === 'Harian');
  assert(!!hp, 'addPackage');
  await GymData.updatePackage(hp.id, { harga: 25000 });
  assert(GymData.getPackage(hp.id).harga === 25000, 'updatePackage');

  console.log(process.exitCode ? '\n=== SOME TESTS FAILED ===' : '\n=== ALL TESTS PASSED ===');
})();
