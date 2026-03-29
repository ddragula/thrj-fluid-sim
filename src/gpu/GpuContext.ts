export class GpuContext {
    public readonly canvas: HTMLCanvasElement;
    public readonly device: GPUDevice;
    public readonly context: GPUCanvasContext;
    public readonly format: GPUTextureFormat;

    private constructor(
        canvas: HTMLCanvasElement,
        device: GPUDevice,
        context: GPUCanvasContext,
        format: GPUTextureFormat
    ) {
        this.canvas = canvas;
        this.device = device;
        this.context = context;
        this.format = format;
    }

    static async create(canvas: HTMLCanvasElement): Promise<GpuContext> {
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

        const gpu = new GpuContext(canvas, device, context, format);
        gpu.resize();

        return gpu;
    }

    resize(): void {
        const dpr = window.devicePixelRatio || 1;
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
}
