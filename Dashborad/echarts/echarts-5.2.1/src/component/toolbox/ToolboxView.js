/*
* Licensed to the Apache Software Foundation (ASF) under one
* or more contributor license agreements.  See the NOTICE file
* distributed with this work for additional information
* regarding copyright ownership.  The ASF licenses this file
* to you under the Apache License, Version 2.0 (the
* "License"); you may not use this file except in compliance
* with the License.  You may obtain a copy of the License at
*
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing,
* software distributed under the License is distributed on an
* "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
* KIND, either express or implied.  See the License for the
* specific language governing permissions and limitations
* under the License.
*/
import * as zrUtil from 'zrender/src/core/util';
import * as textContain from 'zrender/src/contain/text';
import * as graphic from '../../util/graphic';
import { enterEmphasis, leaveEmphasis } from '../../util/states';
import Model from '../../model/Model';
import DataDiffer from '../../data/DataDiffer';
import * as listComponentHelper from '../helper/listComponent';
import ComponentView from '../../view/Component';
import { ToolboxFeature, getFeature } from './featureManager';
import { getUID } from '../../util/component';
import ZRText from 'zrender/src/graphic/Text';
class ToolboxView extends ComponentView {
    render(toolboxModel, ecModel, api, payload) {
        const group = this.group;
        group.removeAll();
        if (!toolboxModel.get('show')) {
            return;
        }
        const itemSize = +toolboxModel.get('itemSize');
        const featureOpts = toolboxModel.get('feature') || {};
        const features = this._features || (this._features = {});
        const featureNames = [];
        zrUtil.each(featureOpts, function (opt, name) {
            featureNames.push(name);
        });
        (new DataDiffer(this._featureNames || [], featureNames))
            .add(processFeature)
            .update(processFeature)
            .remove(zrUtil.curry(processFeature, null))
            .execute();
        // Keep for diff.
        this._featureNames = featureNames;
        function processFeature(newIndex, oldIndex) {
            const featureName = featureNames[newIndex];
            const oldName = featureNames[oldIndex];
            const featureOpt = featureOpts[featureName];
            const featureModel = new Model(featureOpt, toolboxModel, toolboxModel.ecModel);
            let feature;
            // FIX#11236, merge feature title from MagicType newOption. TODO: consider seriesIndex ?
            if (payload && payload.newTitle != null && payload.featureName === featureName) {
                featureOpt.title = payload.newTitle;
            }
            if (featureName && !oldName) { // Create
                if (isUserFeatureName(featureName)) {
                    feature = {
                        onclick: featureModel.option.onclick,
                        featureName: featureName
                    };
                }
                else {
                    const Feature = getFeature(featureName);
                    if (!Feature) {
                        return;
                    }
                    feature = new Feature();
                }
                features[featureName] = feature;
            }
            else {
                feature = features[oldName];
                // If feature does not exsit.
                if (!feature) {
                    return;
                }
            }
            feature.uid = getUID('toolbox-feature');
            feature.model = featureModel;
            feature.ecModel = ecModel;
            feature.api = api;
            const isToolboxFeature = feature instanceof ToolboxFeature;
            if (!featureName && oldName) {
                isToolboxFeature
                    && feature.dispose
                    && feature.dispose(ecModel, api);
                return;
            }
            if (!featureModel.get('show') || (isToolboxFeature && feature.unusable)) {
                isToolboxFeature
                    && feature.remove
                    && feature.remove(ecModel, api);
                return;
            }
            createIconPaths(featureModel, feature, featureName);
            featureModel.setIconStatus = function (iconName, status) {
                const option = this.option;
                const iconPaths = this.iconPaths;
                option.iconStatus = option.iconStatus || {};
                option.iconStatus[iconName] = status;
                if (iconPaths[iconName]) {
                    (status === 'emphasis' ? enterEmphasis : leaveEmphasis)(iconPaths[iconName]);
                }
            };
            if (feature instanceof ToolboxFeature) {
                if (feature.render) {
                    feature.render(featureModel, ecModel, api, payload);
                }
            }
        }
        function createIconPaths(featureModel, feature, featureName) {
            const iconStyleModel = featureModel.getModel('iconStyle');
            const iconStyleEmphasisModel = featureModel.getModel(['emphasis', 'iconStyle']);
            // If one feature has mutiple icon. they are orginaized as
            // {
            //     icon: {
            //         foo: '',
            //         bar: ''
            //     },
            //     title: {
            //         foo: '',
            //         bar: ''
            //     }
            // }
            const icons = (feature instanceof ToolboxFeature && feature.getIcons)
                ? feature.getIcons() : featureModel.get('icon');
            const titles = featureModel.get('title') || {};
            let iconsMap;
            let titlesMap;
            if (typeof icons === 'string') {
                iconsMap = {};
                iconsMap[featureName] = icons;
            }
            else {
                iconsMap = icons;
            }
            if (typeof titles === 'string') {
                titlesMap = {};
                titlesMap[featureName] = titles;
            }
            else {
                titlesMap = titles;
            }
            const iconPaths = featureModel.iconPaths = {};
            zrUtil.each(iconsMap, function (iconStr, iconName) {
                const path = graphic.createIcon(iconStr, {}, {
                    x: -itemSize / 2,
                    y: -itemSize / 2,
                    width: itemSize,
                    height: itemSize
                }); // TODO handling image
                path.setStyle(iconStyleModel.getItemStyle());
                const pathEmphasisState = path.ensureState('emphasis');
                pathEmphasisState.style = iconStyleEmphasisModel.getItemStyle();
                // Text position calculation
                const textContent = new ZRText({
                    style: {
                        text: titlesMap[iconName],
                        align: iconStyleEmphasisModel.get('textAlign'),
                        borderRadius: iconStyleEmphasisModel.get('textBorderRadius'),
                        padding: iconStyleEmphasisModel.get('textPadding'),
                        fill: null
                    },
                    ignore: true
                });
                path.setTextContent(textContent);
                graphic.setTooltipConfig({
                    el: path,
                    componentModel: toolboxModel,
                    itemName: iconName,
                    formatterParamsExtra: {
                        title: titlesMap[iconName]
                    }
                });
                // graphic.enableHoverEmphasis(path);
                path.__title = titlesMap[iconName];
                path.on('mouseover', function () {
                    // Should not reuse above hoverStyle, which might be modified.
                    const hoverStyle = iconStyleEmphasisModel.getItemStyle();
                    const defaultTextPosition = toolboxModel.get('orient') === 'vertical'
                        ? (toolboxModel.get('right') == null ? 'right' : 'left')
                        : (toolboxModel.get('bottom') == null ? 'bottom' : 'top');
                    textContent.setStyle({
                        fill: (iconStyleEmphasisModel.get('textFill')
                            || hoverStyle.fill || hoverStyle.stroke || '#000'),
                        backgroundColor: iconStyleEmphasisModel.get('textBackgroundColor')
                    });
                    path.setTextConfig({
                        position: iconStyleEmphasisModel.get('textPosition') || defaultTextPosition
                    });
                    textContent.ignore = !toolboxModel.get('showTitle');
                    // Use enterEmphasis and leaveEmphasis provide by ec.
                    // There are flags managed by the echarts.
                    enterEmphasis(this);
                })
                    .on('mouseout', function () {
                    if (featureModel.get(['iconStatus', iconName]) !== 'emphasis') {
                        leaveEmphasis(this);
                    }
                    textContent.hide();
                });
                (featureModel.get(['iconStatus', iconName]) === 'emphasis' ? enterEmphasis : leaveEmphasis)(path);
                group.add(path);
                path.on('click', zrUtil.bind(feature.onclick, feature, ecModel, api, iconName));
                iconPaths[iconName] = path;
            });
        }
        listComponentHelper.layout(group, toolboxModel, api);
        // Render background after group is layout
        // FIXME
        group.add(listComponentHelper.makeBackground(group.getBoundingRect(), toolboxModel));
        // Adjust icon title positions to avoid them out of screen
        group.eachChild(function (icon) {
            const titleText = icon.__title;
            // const hoverStyle = icon.hoverStyle;
            // TODO simplify code?
            const emphasisState = icon.ensureState('emphasis');
            const emphasisTextConfig = emphasisState.textConfig || (emphasisState.textConfig = {});
            const textContent = icon.getTextContent();
            const emphasisTextState = textContent && textContent.states.emphasis;
            // May be background element
            if (emphasisTextState && !zrUtil.isFunction(emphasisTextState) && titleText) {
                const emphasisTextStyle = emphasisTextState.style || (emphasisTextState.style = {});
                const rect = textContain.getBoundingRect(titleText, ZRText.makeFont(emphasisTextStyle));
                const offsetX = icon.x + group.x;
                const offsetY = icon.y + group.y + itemSize;
                let needPutOnTop = false;
                if (offsetY + rect.height > api.getHeight()) {
                    emphasisTextConfig.position = 'top';
                    needPutOnTop = true;
                }
                const topOffset = needPutOnTop ? (-5 - rect.height) : (itemSize + 8);
                if (offsetX + rect.width / 2 > api.getWidth()) {
                    emphasisTextConfig.position = ['100%', topOffset];
                    emphasisTextStyle.align = 'right';
                }
                else if (offsetX - rect.width / 2 < 0) {
                    emphasisTextConfig.position = [0, topOffset];
                    emphasisTextStyle.align = 'left';
                }
            }
        });
    }
    updateView(toolboxModel, ecModel, api, payload) {
        zrUtil.each(this._features, function (feature) {
            feature instanceof ToolboxFeature
                && feature.updateView && feature.updateView(feature.model, ecModel, api, payload);
        });
    }
    // updateLayout(toolboxModel, ecModel, api, payload) {
    //     zrUtil.each(this._features, function (feature) {
    //         feature.updateLayout && feature.updateLayout(feature.model, ecModel, api, payload);
    //     });
    // },
    remove(ecModel, api) {
        zrUtil.each(this._features, function (feature) {
            feature instanceof ToolboxFeature
                && feature.remove && feature.remove(ecModel, api);
        });
        this.group.removeAll();
    }
    dispose(ecModel, api) {
        zrUtil.each(this._features, function (feature) {
            feature instanceof ToolboxFeature
                && feature.dispose && feature.dispose(ecModel, api);
        });
    }
}
ToolboxView.type = 'toolbox';
function isUserFeatureName(featureName) {
    return featureName.indexOf('my') === 0;
}
export default ToolboxView;
