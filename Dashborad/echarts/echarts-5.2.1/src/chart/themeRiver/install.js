import ThemeRiverView from './ThemeRiverView';
import ThemeRiverSeriesModel from './ThemeRiverSeries';
import themeRiverLayout from './themeRiverLayout';
import dataFilter from '../../processor/dataFilter';
export function install(registers) {
    registers.registerChartView(ThemeRiverView);
    registers.registerSeriesModel(ThemeRiverSeriesModel);
    registers.registerLayout(themeRiverLayout);
    registers.registerProcessor(dataFilter('themeRiver'));
}
