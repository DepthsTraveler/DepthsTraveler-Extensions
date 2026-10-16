# DepthsTraveler's Extensions

Paperback extensions collected from other repositories into one install link. Each extension is synced from a fork, so fixes made in a fork can also go back to the original author as a pull request.

## Install

Add this repository in Paperback:

https://depthstraveler.github.io/DepthsTraveler-Extensions/0.9/stable/

## Extensions

| Extension | From | Original author | License |
| --- | --- | --- | --- |
| LeagueOfComicGeeks | [DepthsTraveler/KakarotExtension](https://github.com/DepthsTraveler/KakarotExtension) | [karrot0/KakarotExtension](https://github.com/karrot0/KakarotExtension) | MIT |
| ReadComicsOnline | [DepthsTraveler/KakarotExtension](https://github.com/DepthsTraveler/KakarotExtension) | [karrot0/KakarotExtension](https://github.com/karrot0/KakarotExtension) | MIT |
| NovelBuddy | [DepthsTraveler/Sinon-Paperback-Extensions](https://github.com/DepthsTraveler/Sinon-Paperback-Extensions) | [Catta1997/Sinon-Paperback-Extensions](https://github.com/Catta1997/Sinon-Paperback-Extensions) | GPL-3.0 |

## How it works

`sources.json` lists which folders to copy from which fork and branch. The workflow in `.github/workflows/sync-build-deploy.yaml` copies them into `src/`, builds, and publishes the install link. It runs once a day, whenever this repository changes, and on demand from the Actions tab with "Run workflow".

Edit extensions in their fork, not here; the next sync overwrites `src/`.

To add an extension, add its folder (and any shared files it imports) to the matching entry in `sources.json`, or add a new entry for a new fork.

## License

This repository is GPL-3.0, because it includes GPL-3.0 code. Code from KakarotExtension remains available under its original MIT license, copyright 2024 Paperback Community.
