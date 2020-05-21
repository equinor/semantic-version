const core = require('@actions/core');
const exec = require("@actions/exec");
const eol = require('os').EOL;

const tagPrefix = core.getInput('tag_prefix') || '';
const increment_delimiter = core.getInput('increment_delimiter', { required: true });

const cmd = async (command, ...args) => {
    let output = '';
    const options = {
        silent: true
    };
    options.listeners = {
        stdout: (data) => { output += data.toString(); }
    };

    await exec.exec(command, args, options)
        .catch(err => { core.error(`${command} ${args.join(' ')} failed: ${err}`); throw err; });
    return output;
};


const setOutput = (major, minor, patch, increment, branch) => {
    const main_format = core.getInput('main_format', { required: true });
    const increment_format = core.getInput('increment_format', { required: true });

    let main_version = main_format
        .replace('${major}', major)
        .replace('${minor}', minor)
        .replace('${patch}', patch);

    let increment_version = increment_format
        .replace('${increment}', increment);

    const release_tag = tagPrefix + main_version;

    let version_tag = tagPrefix + main_version + increment_delimiter + increment_version;

    const repository = process.env.GITHUB_REPOSITORY;

    core.info(`Version is ${major}.${minor}.${patch}+${increment}`);
    if (repository !== undefined) {
        core.info(`To create a release for this version, go to https://github.com/${repository}/releases/new?tag=${release_tag}&target=${branch.split('/').reverse()[0]}`);
    }
    core.setOutput("tag", version_tag);
    core.setOutput("version", version_tag);
    core.setOutput("major", major.toString());
    core.setOutput("minor", minor.toString());
    core.setOutput("patch", patch.toString());
    core.setOutput("increment", increment.toString());
};

function splitTag(tag) {
    let tagParts = tag.split('/');
    let delimitedValues = tagParts[tagParts.length - 1]
        .substr(tagPrefix.length)
        .split(increment_delimiter);

    let incrementPart = delimitedValues.length > 1 ? delimitedValues[1] : '';

    let mainValues = delimitedValues[0]
        .split('.');

    return [mainValues, incrementPart]
}

async function getHistory(root, branch) {
    const log = await cmd(
        'git',
        'log',
        '--pretty="%s"',
        '--author-date-order',
        root === '' ? branch : `${root}..${branch}`);

    return log
        .trim()
        .split(eol)
        .reverse();
}

function bumpRegular(history, majorIndex, minorIndex, major, minor, patch, increment) {
    if (majorIndex !== -1) {
        increment = history.length - (majorIndex + 1);
        patch = 0;
        minor = 0;
        major++;
    } else if (minorIndex !== -1) {
        increment = history.length - (minorIndex + 1);
        patch = 0;
        minor++;
    } else {
        increment = history.length - 1;
        patch++;
    }
    return [major, minor, patch, increment]
}

function bumpSame(history, majorIndex, minorIndex, releaseMajor, releaseMinor, releasePatch, major, minor, patch, increment) {
    if (majorIndex !== -1 && releaseMajor >= major) {
        increment = history.length - (majorIndex + 1);
        patch = 0;
        minor = 0;
        major++;
    } else if (minorIndex !== -1 && releaseMinor >= minor && releaseMajor >= major) {
        increment = history.length - (minorIndex + 1);
        patch = 0;
        minor++;
    } else if (releasePatch >= patch && releaseMinor >= minor && releaseMajor >= major) {
        increment = history.length - 1;
        patch++;
    } else {
        increment++;
    }
    return [major, minor, patch, increment]
}


async function run() {
    try {
        const remote = await cmd('git', 'remote');
        const remoteExists = remote !== '';
        const remotePrefix = remoteExists ? 'origin/' : '';

        const branch = `${remotePrefix}${core.getInput('branch', { required: true })}`;
        const majorPattern = core.getInput('major_pattern', { required: true }).toLowerCase();
        const minorPattern = core.getInput('minor_pattern', { required: true }).toLowerCase();

        let major = 0, minor = 0, patch = 0, increment = 0;

        let lastCommitAll = (await cmd('git', 'rev-list', '-n1', '--all'))
            .trim();

        if (lastCommitAll === '') {
            // empty repo
            setOutput('0', '0', '0', '0', branch);
            return;
        }

        //let commit = (await cmd('git', 'rev-parse', 'HEAD')).trim();

        let tags = [];
        try {
            tags = (await cmd('git', `tag` ))
                .trim()
                .split(eol)
                .reverse();
        }
        catch (err) {
            tags = [];
        }

        let root;
        if (tags === []) {
            if (remoteExists) {
            core.warning('No tags are present for this repository. If this is unexpected, check to ensure that tags have been pulled from the remote.');
            }
            // no release tags yet, use the initial commit as the root
            root = '';
        } else {
            let currentTag = tags[0];

            let tagParts = splitTag(currentTag);

            const mainValues = tagParts[0];
            const incrementPart = tagParts[1];

            major = parseInt(mainValues[0]);
            minor = mainValues.length > 1 ? parseInt(mainValues[1]) : 0;
            patch = mainValues.length > 2 ? parseInt(mainValues[2]) : 0;
            increment = incrementPart !== '' ? parseInt(incrementPart) : -1;

            if (isNaN(major) || isNaN(minor) || isNaN(patch) || isNaN(increment)) {
                throw `Invalid tag ${currentTag}`;
            }

          root = await cmd('git', `merge-base`, currentTag, branch);
        }
        root = root.trim();

        let history = await getHistory(root, branch);

        // Discover the change time from the history log by finding the oldest log
        // that could set the version.
        const majorIndex = history.findIndex(x => x.toLowerCase().includes(majorPattern));
        const minorIndex = history.findIndex(x => x.toLowerCase().includes(minorPattern));

        let parts = [];

        if (tags !== []) {
            let releaseTag = tags.find(x => !x.includes(increment_delimiter));

            if (releaseTag !== undefined && releaseTag !== tags[0]) {

                let releaseTagParts = splitTag(releaseTag);

                const releaseMainValues = releaseTagParts[0];
                const releaseIncrementPart = releaseTagParts[1];

                const releaseMajor = parseInt(releaseMainValues[0]);
                const releaseMinor = releaseMainValues.length > 1 ? parseInt(releaseMainValues[1]) : 0;
                const releasePatch = releaseMainValues.length > 2 ? parseInt(releaseMainValues[2]) : 0;
                const releaseIncrement = releaseIncrementPart !== '' ? parseInt(releaseIncrementPart) : -1;

                if (isNaN(releaseMajor) || isNaN(releaseMinor) || isNaN(releasePatch) || isNaN(releaseIncrement)) {
                    throw `Invalid tag ${releaseTag}`;
                }

                parts = bumpSame(
                    history, majorIndex, minorIndex, releaseMajor, releaseMinor, releasePatch, major, minor, patch,
                    increment
                );

            } else {
                parts = bumpRegular(history, majorIndex, minorIndex, major, minor, patch, increment);
            }
        } else {
            parts = bumpRegular(history, majorIndex, minorIndex, major, minor, patch, increment);
        }

        major = parts[0];
        minor = parts[1];
        patch = parts[2];
        increment = parts[3];

        setOutput(major, minor, patch, increment, branch);

    } catch (error) {
        core.error(error.toString());
        core.setFailed(error.message);
    }
}

run();
