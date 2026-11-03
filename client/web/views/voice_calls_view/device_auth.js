function callNative(action, args = []) {
  return new Promise((resolve, reject) => {
    const exec = window.cordova && window.cordova.exec;

    if (typeof exec !== 'function') {
      reject(new Error('Secure device authentication requires the iOS app.'));
      return;
    }

    exec(
      value => {
        if (typeof value === 'string' && value.length > 0) {
          resolve(value);
        } else {
          reject(new Error('Empty device authentication response'));
        }
      },
      error => reject(new Error(
        typeof error === 'string' ? error : 'Device authentication failed'
      )),
      'OutlinePlugin',
      action,
      args
    );
  });
}

export function getOrCreateDevicePublicKey() {
  if (typeof window.azizanGetDevicePublicKey === 'function') {
    return window.azizanGetDevicePublicKey();
  }

  return callNative('azizanGetOrCreatePublicKey');
}

export function signDeviceChallenge(challenge) {
  if (typeof challenge !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
    return Promise.reject(new Error('Invalid authentication challenge'));
  }

  if (typeof window.azizanSignDeviceChallenge === 'function') {
    return window.azizanSignDeviceChallenge(challenge);
  }

  return callNative('azizanSignChallenge', [challenge]);
}
