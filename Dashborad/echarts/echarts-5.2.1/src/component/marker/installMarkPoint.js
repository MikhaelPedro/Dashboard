import checkMarkerInSeries from './checkMarkerInSeries';
import MarkPointModel from './MarkPointModel';
import MarkPointView from './MarkPointView';
export function install(registers) {
    registers.registerComponentModel(MarkPointModel);
    registers.registerComponentView(MarkPointView);
    registers.registerPreprocessor(function (opt) {
        if (checkMarkerInSeries(opt.series, 'markPoint')) {
            // Make sure markPoint component is enabled
            opt.markPoint = opt.markPoint || {};
        }
    });
}
