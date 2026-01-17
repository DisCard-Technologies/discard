/**
 * Expo Camera Mock
 *
 * Mocks expo-camera for testing QR scanning and camera operations.
 */

export const mockCamera = {
  requestCameraPermissionsAsync: jest.fn(async () => ({
    status: 'granted',
    granted: true,
    canAskAgain: true,
    expires: 'never',
  })),
  getCameraPermissionsAsync: jest.fn(async () => ({
    status: 'granted',
    granted: true,
    canAskAgain: true,
    expires: 'never',
  })),
  Camera: 'Camera',
  CameraType: {
    front: 'front',
    back: 'back',
  },
  FlashMode: {
    on: 'on',
    off: 'off',
    auto: 'auto',
    torch: 'torch',
  },
  AutoFocus: {
    on: 'on',
    off: 'off',
  },
  WhiteBalance: {
    auto: 'auto',
    sunny: 'sunny',
    cloudy: 'cloudy',
    shadow: 'shadow',
    fluorescent: 'fluorescent',
    incandescent: 'incandescent',
  },
  PermissionStatus: {
    UNDETERMINED: 'undetermined',
    GRANTED: 'granted',
    DENIED: 'denied',
  },
};

// Mock for BarCodeScanner (used in QR scanning)
export const mockBarCodeScanner = {
  requestPermissionsAsync: jest.fn(async () => ({
    status: 'granted',
    granted: true,
  })),
  getPermissionsAsync: jest.fn(async () => ({
    status: 'granted',
    granted: true,
  })),
  BarCodeScanner: 'BarCodeScanner',
  Constants: {
    BarCodeType: {
      qr: 'qr',
      pdf417: 'pdf417',
      aztec: 'aztec',
      ean13: 'ean13',
      ean8: 'ean8',
      upc_e: 'upc_e',
      upc_a: 'upc_a',
      code39: 'code39',
      code93: 'code93',
      code128: 'code128',
      code39mod43: 'code39mod43',
      interleaved2of5: 'interleaved2of5',
      itf14: 'itf14',
      datamatrix: 'datamatrix',
      maxicode: 'maxicode',
      rss14: 'rss14',
      rssexpanded: 'rssexpanded',
    },
    Type: {
      front: 'front',
      back: 'back',
    },
  },
};

// Helper to simulate QR code scan
export const simulateQRScan = (data: string, type: string = 'qr') => ({
  type,
  data,
  bounds: {
    origin: { x: 0, y: 0 },
    size: { width: 100, height: 100 },
  },
  cornerPoints: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ],
});

// Helper to deny camera permissions for testing permission flows
export const denyCameraPermissions = () => {
  mockCamera.requestCameraPermissionsAsync.mockResolvedValueOnce({
    status: 'denied',
    granted: false,
    canAskAgain: true,
    expires: 'never',
  });
  mockCamera.getCameraPermissionsAsync.mockResolvedValueOnce({
    status: 'denied',
    granted: false,
    canAskAgain: true,
    expires: 'never',
  });
};

jest.mock('expo-camera', () => mockCamera);
