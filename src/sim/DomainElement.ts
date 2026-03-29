export type DomainPoint = {
    x: number;
    y: number;
};

export type AmbientWallElement = {
    kind: 'ambientWall';
    start: DomainPoint;
    end: DomainPoint;
    thickness: number;
};

export type HotCircleElement = {
    kind: 'hotCircle';
    center: DomainPoint;
    radius: number;
    temperature?: number;
};

export type DomainElement = AmbientWallElement | HotCircleElement;
export type DomainEditMode = 'navigate' | 'hotCircle' | 'ambientWall';

export const MAX_DOMAIN_ELEMENTS = 16;
