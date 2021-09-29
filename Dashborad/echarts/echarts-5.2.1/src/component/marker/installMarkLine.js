import checkMarkerInSeries from './checkMarkerInSeries';
import MarkLineModel from './MarkLineModel';
import MarkLineView from './MarkLineView';
export function install(registers) {
    registers.registerComponentModel(MarkLineModel);
    registers.registerComponentView(MarkLineView);
    registers.registerPreprocessor(function (opt) {
        if (checkMarkerInSeries(opt.series, 'markLine')) {
            // Make sure markLine component is enabled
            opt.markLine = opt.markLine || {};
        }
    });
}
