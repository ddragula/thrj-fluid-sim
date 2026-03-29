import { GpuContext } from '../gpu/GpuContext';
import { RenderMode } from './RenderMode';
import { getTemperatureDisplayRange } from './temperatureScale';
import presentFieldsShader from '../shaders/present-fields.wgsl?raw';

export class FieldRenderer {
    private readonly renderParamsBuffer: GPUBuffer;
    private readonly pipeline: GPURenderPipeline;

    constructor(private readonly gpu: GpuContext) {
        this.renderParamsBuffer = gpu.device.createBuffer({
            size: 32,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        const module = gpu.device.createShaderModule({
            code: presentFieldsShader
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

    render(
        dyeView: GPUTextureView,
        temperatureView: GPUTextureView,
        velocityView: GPUTextureView,
        mode: RenderMode,
        ambientTemperature: number,
        heaterTemperature: number
    ): void {
        const { device, context } = this.gpu;
        const temperatureDisplayRange = getTemperatureDisplayRange(
            ambientTemperature,
            heaterTemperature
        );

        const renderParams = new ArrayBuffer(32);
        const renderParamsView = new DataView(renderParams);
        renderParamsView.setUint32(0, mode, true);
        renderParamsView.setFloat32(16, ambientTemperature, true);
        renderParamsView.setFloat32(20, heaterTemperature, true);
        renderParamsView.setFloat32(24, temperatureDisplayRange.min, true);
        renderParamsView.setFloat32(28, temperatureDisplayRange.max, true);

        device.queue.writeBuffer(this.renderParamsBuffer, 0, renderParams);

        const bindGroup = device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: dyeView },
                { binding: 1, resource: temperatureView },
                { binding: 2, resource: velocityView },
                { binding: 3, resource: { buffer: this.renderParamsBuffer } }
            ]
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
