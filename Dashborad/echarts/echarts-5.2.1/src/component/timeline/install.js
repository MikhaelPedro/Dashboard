import SliderTimelineModel from './SliderTimelineModel';
import SliderTimelineView from './SliderTimelineView';
import { installTimelineAction } from './timelineAction';
import preprocessor from './preprocessor';
export function install(registers) {
    registers.registerComponentModel(SliderTimelineModel);
    registers.registerComponentView(SliderTimelineView);
    registers.registerSubTypeDefaulter('timeline', function () {
        // Only slider now.
        return 'slider';
    });
    installTimelineAction(registers);
    registers.registerPreprocessor(preprocessor);
}
