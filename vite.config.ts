import { defineConfig } from 'vite';

function getBasePath(): string {
    if (process.env.GITHUB_ACTIONS !== 'true') {
        return '/';
    }

    const repository = process.env.GITHUB_REPOSITORY?.split('/')[1];
    const owner = process.env.GITHUB_REPOSITORY_OWNER;

    if (!repository) {
        return '/';
    }

    if (owner && repository.toLowerCase() === `${owner.toLowerCase()}.github.io`) {
        return '/';
    }

    return `/${repository}/`;
}

export default defineConfig({
    base: getBasePath()
});
