import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { computed } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { Doc } from '../../../fields/Doc';
import { collectionSchema, documentSchema } from '../../../fields/documentSchemas';
import { makeInterface } from '../../../fields/Schema';
import { NumCast, ScriptCast, StrCast } from '../../../fields/Types';
import { OmitKeys, returnFalse } from '../../../Utils';
import { DragManager } from '../../util/DragManager';
import { DocumentView } from '../nodes/DocumentView';
import { FormattedTextBox } from '../nodes/formattedText/FormattedTextBox';
import { StyleProp } from '../StyleProvider';
import "./CollectionCarouselView.scss";
import { CollectionSubView } from './CollectionSubView';

type CarouselDocument = makeInterface<[typeof documentSchema, typeof collectionSchema]>;
const CarouselDocument = makeInterface(documentSchema, collectionSchema);

@observer
export class CollectionCarouselView extends CollectionSubView(CarouselDocument) {
    private _dropDisposer?: DragManager.DragDropDisposer;

    componentWillUnmount() { this._dropDisposer?.(); }

    protected createDashEventsTarget = (ele: HTMLDivElement) => { //used for stacking and masonry view
        this._dropDisposer?.();
        if (ele) {
            this._dropDisposer = DragManager.MakeDropTarget(ele, this.onInternalDrop.bind(this), this.layoutDoc);
        }
    }

    advance = (e: React.MouseEvent) => {
        e.stopPropagation();
        this.layoutDoc._itemIndex = (NumCast(this.layoutDoc._itemIndex) + 1) % this.childLayoutPairs.length;
    }
    goback = (e: React.MouseEvent) => {
        e.stopPropagation();
        this.layoutDoc._itemIndex = (NumCast(this.layoutDoc._itemIndex) - 1 + this.childLayoutPairs.length) % this.childLayoutPairs.length;
    }
    panelHeight = () => this.props.PanelHeight() - 50;
    onContentDoubleClick = () => ScriptCast(this.layoutDoc.onChildDoubleClick);
    onContentClick = () => ScriptCast(this.layoutDoc.onChildClick);
    @computed get content() {
        const index = NumCast(this.layoutDoc._itemIndex);
        const curDoc = this.childLayoutPairs?.[index];
        return !(curDoc?.layout instanceof Doc) ? (null) :
            <>
                <div className="collectionCarouselView-image" key="image">
                    <DocumentView  {...OmitKeys(this.props, ["NativeWidth", "NativeHeight", "childLayoutTemplate", "childLayoutString"]).omit}
                        onDoubleClick={this.onContentDoubleClick}
                        onClick={this.onContentClick}
                        renderDepth={this.props.renderDepth + 1}
                        LayoutTemplate={this.props.childLayoutTemplate}
                        LayoutTemplateString={this.props.childLayoutString}
                        Document={curDoc.layout}
                        DataDoc={curDoc.layout.resolvedDataDoc as Doc}
                        PanelHeight={this.panelHeight}
                        bringToFront={returnFalse}
                    />
                </div>
                <div className="collectionCarouselView-caption" key="caption"
                    style={{
                        background: this.props.styleProvider?.(this.layoutDoc, this.props, StyleProp.BackgroundColor + ":caption"),
                        color: this.props.styleProvider?.(this.layoutDoc, this.props, StyleProp.Color + ":caption"),
                        borderRadius: this.props.styleProvider?.(this.layoutDoc, this.props, StyleProp.BorderRounding + ":caption"),
                    }}>
                    <FormattedTextBox key={index} {...this.props}
                        Document={curDoc.layout} DataDoc={undefined} fieldKey={"caption"}
                        fontSize={NumCast(this.layoutDoc["caption-fontSize"])}
                        xMargin={NumCast(this.layoutDoc["caption-xMargin"])}
                        yMargin={NumCast(this.layoutDoc["caption-yMargin"])} />
                </div>
            </>;
    }
    @computed get buttons() {
        return <>
            <div key="back" className="carouselView-back" style={{ background: `${StrCast(this.layoutDoc.backgroundColor)}` }} onClick={this.goback}>
                <FontAwesomeIcon icon={"caret-left"} size={"2x"} />
            </div>
            <div key="fwd" className="carouselView-fwd" style={{ background: `${StrCast(this.layoutDoc.backgroundColor)}` }} onClick={this.advance}>
                <FontAwesomeIcon icon={"caret-right"} size={"2x"} />
            </div>
        </>;
    }

    render() {
        return <div className="collectionCarouselView-outer" ref={this.createDashEventsTarget}
            style={{
                background: this.props.styleProvider?.(this.layoutDoc, this.props, StyleProp.BackgroundColor),
                color: this.props.styleProvider?.(this.layoutDoc, this.props, StyleProp.Color),
            }}>
            {this.content}
            {this.props.Document._chromeHidden ? (null) : this.buttons}
        </div>;
    }
}