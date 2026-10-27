import { Octokit } from 'octokit';
import { TextDecoder } from 'node:util';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { Buffer } from 'node:buffer';
import yaml from 'js-yaml';

// https://github.com/electron-userland/electron-builder/issues/5592#issuecomment-2004803764

const pkg = JSON.parse(fs.readFileSync('package.json'));

const token = process.env.GH_TOKEN;

const client = new Octokit({
  auth: token,
});

// THE REPOSITORY IS READ FROM THE ENVIRONMENT, NOT HARDCODED.
//
// This said `holochain` / `launcher` — inherited verbatim from the template,
// where it was correct — so on this fork it asked the LAUNCHER's releases
// whether they had a `v<our version>`, got no, logged "No release found.
// Skipping merge" and returned 0. Every release from v0.1.0 to v0.3.1
// therefore shipped a `latest-mac.yml` listing ONE architecture: whichever
// mac job's electron-builder uploaded it, with the other arch advertised to
// nobody. Both mac jobs were green every time.
//
// It stayed invisible because every release until 0.3.1 was a MINOR, and
// electron-updater does not offer those across, so the manifest was never
// served. 0.3.1 is the first auto-update-eligible release this app has cut,
// which is when an Apple Silicon install would have been handed the Intel
// build.
//
// GITHUB_REPOSITORY is set by Actions for every step. The package.json
// fallback is for running this by hand, and the throw is because a wrong
// answer here is worse than a stopped job.
function resolveRepo() {
  const fromEnv = process.env.GITHUB_REPOSITORY;
  if (fromEnv && fromEnv.includes('/')) return fromEnv.split('/');

  const url = pkg.repository && (pkg.repository.url || pkg.repository);
  const m = typeof url === 'string' && url.match(/github\.com[/:]([^/]+)\/(.+?)(?:\.git)?$/);
  if (m) return [m[1], m[2]];

  throw new Error(
    'Cannot determine the repository: GITHUB_REPOSITORY is unset and package.json has no usable repository URL.',
  );
}

const [OWNER, REPO] = resolveRepo();
const URL = `/repos/${OWNER}/${REPO}/releases`;
const VERSION = pkg.version;
const APP_ID = pkg.name;
const FILE_NAME = 'latest-mac.yml';
const LOCAL_FILE_PATH = `dist/${FILE_NAME}`;

const mergeFiles = (intel, arm) => {
  const intelObject = yaml.load(intel);
  const armObject = yaml.load(arm);

  const mergedObject = {
    ...intelObject,
  };

  mergedObject.files = [...intelObject.files, ...armObject.files];

  const dumpOptions = {
    // avoids moving the sha512 checksum into its own line
    lineWidth: -1,
  };

  const mergedString = yaml.dump(mergedObject, dumpOptions);
  return mergedString;
};

const getPlatformFromLatestMacYml = (content) => {
  const intelRe = `${APP_ID}-${VERSION}-x64.dmg`;
  const armRe = `${APP_ID}-${VERSION}-arm64.dmg`;
  const isIntel = content.includes(intelRe);
  const isArm = content.includes(armRe);

  if (isIntel && isArm) return 'both';
  if (isIntel && !isArm) return 'intel';
  if (!isIntel && isArm) return 'arm';

  return 'none';
};

(async () => {
  const allReleases = await client.request(`GET ${URL}`);
  console.log('VERSION: ', VERSION);
  // console.log('ALL RELEASES: ', allReleases);
  const currentRelease = allReleases.data.find((release) => {
    return release.tag_name === `v${VERSION}`;
  });

  if (!currentRelease) {
    // NOT a soft skip. The release procedure in README.md creates the release
    // (as a draft) BEFORE the push to `release`, so its absence means either
    // that step was missed or this is pointed at the wrong repository — and
    // returning 0 here is what hid the wrong repository for four releases.
    throw new Error(
      `No release tagged v${VERSION} found in ${OWNER}/${REPO}. ` +
        'Create it (draft is fine) before pushing to `release` — see Releasing in README.md.',
    );
  } else {
    console.log('Release found: ', currentRelease.name);
  }

  const localLatestMacYmlExists = fs.existsSync(LOCAL_FILE_PATH);

  if (!localLatestMacYmlExists) {
    console.log(`[local] could not find ${FILE_NAME}. Skipping merge`);
    return;
  } else {
    console.log(`[local] ${FILE_NAME} found`);
  }

  const localLatestMacYmlContent = fs.readFileSync(LOCAL_FILE_PATH, { encoding: 'utf8' });

  const localPlatform = getPlatformFromLatestMacYml(localLatestMacYmlContent);

  if (localPlatform === 'none' || localPlatform === 'both') {
    console.log(`[local] ${FILE_NAME} invalid. Platform: ${localPlatform}. Skipping merge`);
    throw new Error(`${FILE_NAME} invalid: Platform: ${localPlatform}`);
  } else {
    console.log(`[local] ${FILE_NAME} valid: Platform: ${localPlatform}`);
  }

  const localPlatformPresentRemotely = currentRelease.assets.find((asset) => {
    return asset.name === `latest-mac-${localPlatform}.yml`;
  });

  if (localPlatformPresentRemotely) {
    try {
      await client.request(`DELETE ${URL}/assets/${localPlatformPresentRemotely.id}`);
      console.log(`[remote] deleted latest-mac-${localPlatform}.yml`);
    } catch (e) {
      console.log(`[remote] error deleting latest-mac-${localPlatform}.yml. Skipping merge`);
      console.log(e);
      return;
    }
  }

  const uploadUrl = currentRelease.upload_url;
  const localAssetStream = new Readable();
  localAssetStream.push(localLatestMacYmlContent);
  localAssetStream.push(null);

  try {
    await client.rest.repos.uploadReleaseAsset({
      url: uploadUrl,
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': Buffer.byteLength(localLatestMacYmlContent),
      },
      name: `latest-mac-${localPlatform}.yml`,
      data: localAssetStream,
    });
    console.log(`[remote] latest-mac-${localPlatform}.yml uploaded`);
  } catch (e) {
    console.log(`[remote] error uploading latest-mac-${localPlatform}.yml. Skipping merge`);
    console.log(e);
    return;
  }

  const remotePlatform = localPlatform === 'intel' ? 'arm' : 'intel';

  // RE-READ THE RELEASE BEFORE LOOKING FOR THE OTHER ARCHITECTURE'S FILE.
  // `currentRelease` was fetched before this job uploaded its own, so using
  // that snapshot means each job can only ever see assets that existed when it
  // started. The two mac jobs happened to be ~3 minutes apart, which is the
  // only reason the second one saw the first's file at all; run them close
  // together and NEITHER sees the other, both take the soft return below, and
  // `latest-mac.yml` is single-architecture again with both jobs green.
  const refreshed = await client.request(`GET ${URL}`);
  const refreshedRelease = refreshed.data.find((release) => {
    return release.tag_name === `v${VERSION}`;
  });
  const assetsNow = (refreshedRelease || currentRelease).assets;

  const remotePlatformFileExists = assetsNow.find((asset) => {
    return asset.name === `latest-mac-${remotePlatform}.yml`;
  });

  if (!remotePlatformFileExists) {
    console.log(`[remote] latest-mac-${remotePlatform}.yml does not exists. Skipping merge`);
    return;
  } else {
    console.log(`[remote] latest-mac-${remotePlatform}.yml found`);
  }

  let remotePlatformFile;

  try {
    remotePlatformFile = await client.request(`GET ${URL}/assets/${remotePlatformFileExists.id}`, {
      headers: {
        accept: 'application/octet-stream',
      },
    });
    console.log(`[remote] latest-mac-${remotePlatform}.yml downloaded`);
  } catch (e) {
    console.log(`[remote] error downloading latest-mac-${remotePlatform}.yml. Skipping merge`);
    console.log(e);
    return;
  }

  const remoteLatestMacYmlContent = new TextDecoder().decode(remotePlatformFile.data);

  try {
    const originalAsset = assetsNow.find((asset) => {
      return asset.name === FILE_NAME;
    });

    if (!originalAsset) {
      console.log(`[remote] ${FILE_NAME} not found. Skipping merge`);
      return;
    } else {
      console.log(`[remote] ${FILE_NAME} found`);
    }

    await client.request(`DELETE ${URL}/assets/${originalAsset.id}`);
    console.log(`[remote] deleted ${FILE_NAME}`);
  } catch (e) {
    console.log(`[remote] error deleting ${FILE_NAME}. Skipping merge`);
    console.log(e);
    return;
  }

  const mergedContent =
    remotePlatform === 'intel'
      ? mergeFiles(remoteLatestMacYmlContent, localLatestMacYmlContent)
      : mergeFiles(localLatestMacYmlContent, remoteLatestMacYmlContent);

  const assetStream = new Readable();
  assetStream.push(mergedContent);
  assetStream.push(null);

  try {
    await client.rest.repos.uploadReleaseAsset({
      url: uploadUrl,
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': Buffer.byteLength(mergedContent),
      },
      name: FILE_NAME,
      data: assetStream,
    });
    console.log(`[remote] uploaded merged ${FILE_NAME}`);
  } catch (e) {
    console.log(`[remote] error uploading merged ${FILE_NAME}. Skipping merge`);
    console.log(e);
    return;
  }

  // cleanup
  const updatedRelease = await client.request(`GET ${URL}`);
  const updatedCurrentRelease = updatedRelease.data.find((release) => {
    return release.tag_name === `v${VERSION}`;
  });

  const assetsToClean = updatedCurrentRelease.assets.filter((asset) => {
    return asset.name === `latest-mac-arm.yml` || asset.name === `latest-mac-intel.yml`;
  });

  for (const assetToClean of assetsToClean) {
    try {
      await client.request(`DELETE ${URL}/assets/${assetToClean.id}`);
      console.log(`[remote:cleanup] deleted ${assetToClean.name}`);
    } catch (e) {
      console.log(`[remote:cleanup] error deleting ${assetToClean.name}`);
      console.log(e);
    }
  }

  console.log('Merge complete');
})();
