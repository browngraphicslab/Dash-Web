import { library } from '@fortawesome/fontawesome-svg-core';
import { faEdit } from '@fortawesome/free-regular-svg-icons';
import { runInAction } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { Handles, Rail, Slider, Ticks, Tracks } from 'react-compound-slider';
import { documentSchema } from '../../../new_fields/documentSchemas';
import { createSchema, makeInterface } from '../../../new_fields/Schema';
import { ScriptField } from '../../../new_fields/ScriptField';
import { Cast, NumCast, StrCast } from '../../../new_fields/Types';
import { ContextMenu } from '../ContextMenu';
import { ContextMenuProps } from '../ContextMenuItem';
import { ViewBoxBaseComponent } from '../DocComponent';
import { ScriptBox } from '../ScriptBox';
import { FieldView, FieldViewProps } from './FieldView';
import { Handle, Tick, TooltipRail, Track } from './SliderBox-components';
import './SliderBox.scss';


library.add(faEdit as any);

const SliderSchema = createSchema({
    _sliderMin: "number",
    _sliderMax: "number",
    _sliderMinThumb: "number",
    _sliderMaxThumb: "number",
});

type SliderDocument = makeInterface<[typeof SliderSchema, typeof documentSchema]>;
const SliderDocument = makeInterface(SliderSchema, documentSchema);

@observer
export class SliderBox extends ViewBoxBaseComponent<FieldViewProps, SliderDocument>(SliderDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(SliderBox, fieldKey); }

    get minThumbKey() { return this.fieldKey + "-minThumb"; }
    get maxThumbKey() { return this.fieldKey + "-maxThumb"; }
    get minKey() { return this.fieldKey + "-min"; }
    get maxKey() { return this.fieldKey + "-max"; }
    specificContextMenu = (e: React.MouseEvent): void => {
        const funcs: ContextMenuProps[] = [];
        funcs.push({ description: "Edit Thumb Change Script", icon: "edit", event: (obj: any) => ScriptBox.EditButtonScript("On Thumb Change ...", this.props.Document, "onThumbChange", obj.x, obj.y) });
        ContextMenu.Instance.addItem({ description: "Slider Funcs...", subitems: funcs, icon: "asterisk" });
    }
    onChange = (values: readonly number[]) => runInAction(() => {
        this.dataDoc[this.minThumbKey] = values[0];
        this.dataDoc[this.maxThumbKey] = values[1];
        Cast(this.layoutDoc.onThumbChanged, ScriptField, null)?.script.run({ self: this.rootDoc, range: values, this: this.layoutDoc });
    })

    render() {
        const domain = [NumCast(this.layoutDoc[this.minKey]), NumCast(this.layoutDoc[this.maxKey])];
        const defaultValues = [NumCast(this.dataDoc[this.minThumbKey]), NumCast(this.dataDoc[this.maxThumbKey])];
        return domain[1] <= domain[0] ? (null) : (
            <div className="sliderBox-outerDiv" onContextMenu={this.specificContextMenu} onPointerDown={e => e.stopPropagation()}
                style={{ boxShadow: this.layoutDoc.opacity === 0 ? undefined : StrCast(this.layoutDoc.boxShadow, "") }}>
                <div className="sliderBox-mainButton" onContextMenu={this.specificContextMenu} style={{
                    background: StrCast(this.layoutDoc.backgroundColor), color: StrCast(this.layoutDoc.color, "black"),
                    fontSize: NumCast(this.layoutDoc.fontSize), letterSpacing: StrCast(this.layoutDoc.letterSpacing)
                }} >
                    <Slider
                        mode={2}
                        step={1}
                        domain={domain}
                        rootStyle={{ position: "relative", width: "100%" }}
                        onChange={this.onChange}
                        values={defaultValues}
                    >

                        <Rail>{railProps => <TooltipRail {...railProps} />}</Rail>
                        <Handles>
                            {({ handles, activeHandleID, getHandleProps }) => (
                                <div className="slider-handles">
                                    {handles.map((handle, i) => {
                                        const value = i === 0 ? defaultValues[0] : defaultValues[1];
                                        return (
                                            <div title={String(value)}>
                                                <Handle
                                                    key={handle.id}
                                                    handle={handle}
                                                    domain={domain}
                                                    isActive={handle.id === activeHandleID}
                                                    getHandleProps={getHandleProps}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </Handles>
                        <Tracks left={false} right={false}>
                            {({ tracks, getTrackProps }) => (
                                <div className="slider-tracks">
                                    {tracks.map(({ id, source, target }) => (
                                        <Track
                                            key={id}
                                            source={source}
                                            target={target}
                                            disabled={false}
                                            getTrackProps={getTrackProps}
                                        />
                                    ))}
                                </div>
                            )}
                        </Tracks>
                        <Ticks count={5}>
                            {({ ticks }) => (
                                <div className="slider-tracks">
                                    {ticks.map((tick) => (
                                        <Tick
                                            key={tick.id}
                                            tick={tick}
                                            count={ticks.length}
                                            format={(val: number) => val.toString()}
                                        />
                                    ))}
                                </div>
                            )}
                        </Ticks>
                    </Slider>
                </div>
            </div>
        );
    }
}