import React from 'react';
import renderer from 'react-test-renderer';
import App from '../App';

jest.mock('expo-barcode-scanner', () => {
  const BarCodeScanner = ({ children }) => children || null;
  BarCodeScanner.requestPermissionsAsync = jest.fn().mockResolvedValue({ status: 'granted' });
  return { BarCodeScanner };
});

describe('App', () => {
  it('renders without crashing', async () => {
    const tree = renderer.create(<App />).toJSON();
    expect(tree).toBeTruthy();
  });
});
