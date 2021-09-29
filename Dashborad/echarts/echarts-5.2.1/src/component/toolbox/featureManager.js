class ToolboxFeature {
}
export { ToolboxFeature };
const features = {};
export function registerFeature(name, ctor) {
    features[name] = ctor;
}
export function getFeature(name) {
    return features[name];
}
