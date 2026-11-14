import '@testing-library/jest-native/extend-expect';
import { AppState } from 'react-native';

// Rendered app tests start in the foreground. Individual lifecycle regressions
// deliberately replace this value with inactive/background/unknown states.
Object.defineProperty(AppState, 'currentState', { configurable: true, writable: true, value: 'active' });
