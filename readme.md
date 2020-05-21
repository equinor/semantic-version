![Build](https://github.com/equinor/semantic-version/workflows/Build/badge.svg)

# Git-Based Semantic Versioning

This action produces a [semantic version](https://semver.org) for a repository
using the repository's git history.

This action is designed to facilitate assigning version numbers during a build
automatically while publishing version that only increment by one value per
release. To accomplish this, the next version number is calculated along with
a commit increment indicating the number of commits for this version. The
commit messages are inspected to determine the type of version change the next
version represents. Including the term `BREAKING CHANGE:` or `feat:` in the commit
message alters the type of change the next version will represent.

# Usage

<!-- start usage -->

```yaml
  - name: Semantic versioning
    if: ${{ !startsWith(github.ref , 'refs/pull/') && !startsWith(github.ref , 'refs/tags/') }}
    id: versioning
    uses: equinor/semantic-version@v4.0.0
    with:
      # The branch to count commits on
      branch: master
      # The prefix to use to identify tags
      tag_prefix: "v"
      # A string which, if present in a git commit, indicates that a change represents a major (breaking) change
      major_pattern: "BREAKING CHANGE:"
      # Same as above except indicating a minor change
      minor_pattern: "feat:"
      # A string to determine the format of the version output
      main_format: "${major}.${minor}.${patch}"
      # A string to determine the format of the version output
      increment_format: "${increment}"
      # A string to determine the format of the version output
      increment_delimiter: "dev"
```
