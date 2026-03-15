import { ImageToVectorFeature } from "./image-to-vector/ImageToVectorFeature";

export const FEATURE_REGISTRY = [
  {
    id: "image-to-vector",
    label: "Image to Vector",
    component: ImageToVectorFeature,
    disabled: false,
  },
  {
    id: "future",
    label: "Coming soon",
    component: null,
    disabled: true,
  },
];

export const FEATURE_TOOL_OPTIONS = FEATURE_REGISTRY.map((feature) => ({
  id: feature.id,
  label: feature.label,
}));
