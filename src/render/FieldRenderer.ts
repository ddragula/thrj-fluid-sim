import { GpuContext } from '../gpu/GpuContext';
import presentDensityShader from '../shaders/present-density.wgsl?raw';

export class FieldRenderer {
    private readonly gpu: GpuContext;
    private readonly pipeline: GPURenderPipeline;

    constructor(gpu: GpuContext) {
        this.gpu = gpu;
        const module = gpu.device.createShaderModule({
            code: presentDensityShader
        });

        this.pipeline = gpu.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module,
                entryPoint: 'vs'
            },
            fragment: {
                module,
                entryPoint: 'fs',
                targets: [{ format: gpu.format }]
            },
            primitive: {
                topology: 'triangle-list'
            }
        });
    }

    render(fieldView: GPUTextureView): void {
        const { device, context } = this.gpu;

        const bindGroup = device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [{
                binding: 0,
                resource: fieldView
            }]
        });

        const encoder = device.createCommandEncoder();

        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                clearValue: { r: 0.02, g: 0.025, b: 0.035, a: 1.0 },
                loadOp: 'clear',
                storeOp: 'store'
            }]
        });

        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(3);
        pass.end();

        device.queue.submit([encoder.finish()]);
    }
}