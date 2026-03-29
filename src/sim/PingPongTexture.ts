export class PingPongTexture {
    private index = 0;

    private readonly textures: [GPUTexture, GPUTexture];
    private readonly views: [GPUTextureView, GPUTextureView];

    constructor(
        device: GPUDevice,
        width: number,
        height: number,
        format: GPUTextureFormat,
        usage: GPUTextureUsageFlags
    ) {
        const createTexture = (): GPUTexture =>
            device.createTexture({
                size: { width, height },
                format,
                usage,
            });

        const a = createTexture();
        const b = createTexture();

        this.textures = [a, b];
        this.views = [a.createView(), b.createView()];
    }

    get readTexture(): GPUTexture {
        return this.textures[this.index];
    }

    get writeTexture(): GPUTexture {
        return this.textures[1 - this.index];
    }

    get readView(): GPUTextureView {
        return this.views[this.index];
    }

    get writeView(): GPUTextureView {
        return this.views[1 - this.index];
    }

    swap() {
        this.index = 1 - this.index;
    }
}
