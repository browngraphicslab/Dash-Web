import { library } from '@fortawesome/fontawesome-svg-core';
import { faEdit } from '@fortawesome/free-regular-svg-icons';
import { computed } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { Handles, Rail, Slider, Tracks, Ticks } from 'react-compound-slider';
import { Doc } from '../../../new_fields/Doc';
import { documentSchema } from '../../../new_fields/documentSchemas';
import { createSchema, listSpec, makeInterface } from '../../../new_fields/Schema';
import { ScriptField } from '../../../new_fields/ScriptField';
import { BoolCast, FieldValue, StrCast, NumCast, Cast } from '../../../new_fields/Types';
import { DragManager } from '../../util/DragManager';
import { ContextMenu } from '../ContextMenu';
import { ContextMenuProps } from '../ContextMenuItem';
import { DocComponent } from '../DocComponent';
import './SliderBox.scss';
import { Handle, TooltipRail, Track, Tick } from './SliderBox-components';
import { FieldView, FieldViewProps } from './FieldView';


library.add(faEdit as any);

const ButtonSchema = createSchema({
    onClick: ScriptField,
    buttonParams: listSpec("string"),
    text: "string"
});

type SliderDocument = makeInterface<[typeof ButtonSchema, typeof documentSchema]>;
const SliderDocument = makeInterface(ButtonSchema, documentSchema);

@observer
export class SliderBox extends DocComponent<FieldViewProps, SliderDocument>(SliderDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(SliderBox, fieldKey); }
    private dropDisposer?: DragManager.DragDropDisposer;

    @computed get dataDoc() {
        return this.props.DataDoc &&
            (this.Document.isTemplateForField || BoolCast(this.props.DataDoc.isTemplateForField) ||
                this.props.DataDoc.layout === this.props.Document) ? this.props.DataDoc : Doc.GetProto(this.props.Document);
    }

    specificContextMenu = (e: React.MouseEvent): void => {
        const funcs: ContextMenuProps[] = [];
        funcs.push({
            description: "Clear Script Params", event: () => {
                const params = FieldValue(this.Document.buttonParams);
                params && params.map(p => this.props.Document[p] = undefined);
            }, icon: "trash"
        });

        ContextMenu.Instance.addItem({ description: "OnClick...", subitems: funcs, icon: "asterisk" });
    }
    onChange = (values: readonly number[]) => {
        Cast(this.props.Document.onThumbChanged, ScriptField, null)?.script.run({ range: values, this: this.props.Document })
    }

    render() {
        const domain = [NumCast(this.props.Document._sliderMin), NumCast(this.props.Document._sliderMax)]
        const defaultValues = [NumCast(this.props.Document._sliderMinThumb), NumCast(this.props.Document._sliderMaxThumb)];
        return (
            <div className="sliderBox-outerDiv" onContextMenu={this.specificContextMenu} onPointerDown={e => e.stopPropagation()}
                style={{ boxShadow: this.Document.opacity === 0 ? undefined : StrCast(this.Document.boxShadow, "") }}>
                <div className="sliderBox-mainButton" style={{
                    background: this.Document.backgroundColor, color: this.Document.color || "black",
                    fontSize: this.Document.fontSize, letterSpacing: this.Document.letterSpacing || ""
                }} >
                    <Slider
                        mode={2}
                        step={1}
                        domain={domain}
                        rootStyle={{ position: "relative", width: "100%" }}
                        // onUpdate={this.onUpdate}
                        onChange={this.onChange}
                        values={defaultValues}
                    >

                        <Rail>{railProps => <TooltipRail {...railProps} />}</Rail>
                        <Handles>
                            {({ handles, activeHandleID, getHandleProps }) => (
                                <div className="slider-handles">
                                    {handles.map(handle => (
                                        <Handle
                                            key={handle.id}
                                            handle={handle}
                                            domain={domain}
                                            isActive={handle.id === activeHandleID}
                                            getHandleProps={getHandleProps}
                                        />
                                    ))}
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