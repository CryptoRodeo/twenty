import { releaseVersion } from '../../scripts/release-version';

describe('releaseVersion', () => {
  it('derives versionName and versionCode from a matching tag', () => {
    expect(releaseVersion('v1.2.3', '1.2.3')).toEqual({ versionName: '1.2.3', versionCode: 10203 });
  });

  it('keeps versionCode increasing across minor/patch rollovers', () => {
    const a = releaseVersion('v1.9.99', '1.9.99').versionCode;
    const b = releaseVersion('v1.10.0', '1.10.0').versionCode;
    const c = releaseVersion('v2.0.0', '2.0.0').versionCode;
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });

  it('rejects a tag that does not match app.json', () => {
    expect(() => releaseVersion('v1.0.1', '1.0.0')).toThrow(/v1\.0\.1.*1\.0\.0/);
  });

  it.each(['1.0.0', 'v1.0', 'v1.0.0-beta.1', 'v01.0.0', 'release-1.0.0'])('rejects malformed tag %s', (tag) => {
    expect(() => releaseVersion(tag, '1.0.0')).toThrow(/vMAJOR\.MINOR\.PATCH/);
  });

  it('rejects minor or patch above 99', () => {
    expect(() => releaseVersion('v1.100.0', '1.100.0')).toThrow(/0-99/);
    expect(() => releaseVersion('v1.0.100', '1.0.100')).toThrow(/0-99/);
  });
});
