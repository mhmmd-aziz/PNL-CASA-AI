import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, canAccessTab, getCurrentUser, hasPermission, login, logout } from './auth.js';

test('role definitions do not contain seeded accounts or identities', () => {
  for (const role of Object.values(ROLES)) {
    for (const key of ['user', 'username', 'email', 'password', 'avatar']) {
      assert.equal(role[key], undefined);
    }
  }
});

test('legacy local sessions cannot grant authenticated access', () => {
  const originalWindow = globalThis.window;
  let removedKey;
  globalThis.window = { localStorage: {
    getItem: () => JSON.stringify({ role: 'admin', name: 'Legacy account' }),
    removeItem: (key) => { removedKey = key; },
  } };
  try {
    assert.equal(getCurrentUser(), null);
    assert.equal(login('admin', 'admin123').success, false);
    assert.match(login().error, /belum tersedia/);
    logout();
    assert.equal(removedKey, 'casa_ai_auth_user');
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('each role only reaches the menus defined for it', () => {
  assert.deepEqual(Object.keys(ROLES), ['frontoffice', 'analis', 'dokter', 'pasien', 'superadmin']);
  assert.ok(canAccessTab('frontoffice', 'Registration'));
  assert.ok(!canAccessTab('frontoffice', 'Patient Records'));
  assert.ok(canAccessTab('analis', 'Analysis Lab'));
  assert.ok(!canAccessTab('analis', 'Lab Reports'));
  assert.ok(canAccessTab('dokter', 'Perlu Validasi'));
  assert.ok(!canAccessTab('dokter', 'Analysis Lab'));
  assert.deepEqual(ROLES.pasien.tabs, ['My Queue', 'My Reports', 'Account Settings']);
  assert.equal(ROLES.superadmin.tabs[0], 'Dashboard');
  for (const role of Object.values(ROLES)) {
    if (role.id !== 'superadmin') assert.equal(role.tabs.includes('Dashboard'), false);
  }
  assert.ok(!canAccessTab('superadmin', 'Patient Records'));
  assert.ok(!canAccessTab('unknown', 'Overview'));
});

test('administrative rights do not grant clinical signing or result release', () => {
  assert.ok(hasPermission('superadmin', 'editCalibration'));
  for (const permission of ['signReports', 'releaseReports', 'reviewResults']) {
    assert.ok(!hasPermission('superadmin', permission));
    assert.ok(!hasPermission('analis', permission));
    assert.ok(!hasPermission('frontoffice', permission));
  }
  assert.ok(!hasPermission('analis', 'editCalibration'));
});
