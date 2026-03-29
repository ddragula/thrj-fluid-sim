export class GpuContext {
    public readonly canvas: HTMLCanvasElement;
    public readonly device: GPUDevice;
    public readonly context: GPUCanvasContext;
    public readonly format: GPUTextureFormat;
    private maxDevicePixelRatio: number;

    private constructor(
        canvas: HTMLCanvasElement,
        device: GPUDevice,
        context: GPUCanvasContext,
        format: GPUTextureFormat,
        maxDevicePixelRatio: number
    ) {
        this.canvas = canvas;
        this.device = device;
        this.context = context;
        this.format = format;
        this.maxDevicePixelRatio = maxDevicePixelRatio;
    }

    static async create(
        canvas: HTMLCanvasElement,
        options: { maxDevicePixelRatio?: number } = {}
    ): Promise<GpuContext> {
        if (!navigator.gpu) {
            throw new Error('WebGPU is not available in this browser');
        }

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            throw new Error('Failed to acquire GPU adapter');
        }

        const device = await adapter.requestDevice();

        const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
        if (!context) {
            throw new Error('Failed to acquire WebGPU canvas context');
        }

        const format = navigator.gpu.getPreferredCanvasFormat();
        const maxDevicePixelRatio = Math.max(1.0, options.maxDevicePixelRatio ?? Number.POSITIVE_INFINITY);

        const gpu = new GpuContext(canvas, device, context, format, maxDevicePixelRatio);
        gpu.resize();

        return gpu;
    }

    resize(): void {
        const dpr = Math.min(window.devicePixelRatio || 1, this.maxDevicePixelRatio);
        const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
        const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));

        if (this.canvas.width === width && this.canvas.height === height) {
            return;
        }

        this.canvas.width = width;
        this.canvas.height = height;

        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: 'opaque'
        });
    }

    setMaxDevicePixelRatio(maxDevicePixelRatio: number): void {
        this.maxDevicePixelRatio = Math.max(1.0, maxDevicePixelRatio);
        this.resize();
    }
}
