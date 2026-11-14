import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import config from '../../../app.config';

describe('iOS operator and audience scene registration', () => {
  it('registers separate native delegates and keeps a single private React root', () => {
    const manifest = config.ios?.infoPlist?.UIApplicationSceneManifest;
    const roles = manifest.UISceneConfigurations;
    const main = roles.UIWindowSceneSessionRoleApplication[0].UISceneDelegateClassName;
    const external = roles.UIWindowSceneSessionRoleExternalDisplayNonInteractive[0].UISceneDelegateClassName;
    const swift = readFileSync(resolve(__dirname, '../../../modules/show-visual/ios/ShowVisualModule.swift'), 'utf8');
    expect(manifest.UIApplicationSupportsMultipleScenes).toBe(true);
    expect(main).not.toBe(external);
    for (const name of [main, external]) expect(swift).toContain(`@objc(${name})`);
    expect(roles.UIWindowSceneSessionRoleExternalDisplay[0].UISceneDelegateClassName).toBe(external);
    const primaryDelegate = swift.split(`@objc(${main})`)[1]!.split(`@objc(${external})`)[0]!;
    expect(primaryDelegate).toContain('UIApplication.shared.delegate?.window');
    expect(primaryDelegate).toContain('reactWindow.windowScene = primary');
    expect(primaryDelegate).not.toContain('startReactNative');
    expect(primaryDelegate).toContain('session.role == .windowApplication');
    expect(primaryDelegate).toContain('requestSceneSessionDestruction(session');
  });

  it('preserves Expo lifecycle and link delivery after opting into scenes', () => {
    const swift = readFileSync(resolve(__dirname, '../../../modules/show-visual/ios/ShowVisualModule.swift'), 'utf8');
    for (const callback of ['applicationDidBecomeActive', 'applicationWillResignActive', 'applicationDidEnterBackground', 'applicationWillEnterForeground']) {
      expect(swift).toContain(`delegate?.${callback}?(UIApplication.shared)`);
    }
    expect(swift).toContain('open(connectionOptions.urlContexts)');
    expect(swift).toContain('connectionOptions.userActivities.forEach');
    expect(swift).toContain('open: context.url, options: options');
    expect(swift).toContain('continue: activity, restorationHandler:');
  });
});
