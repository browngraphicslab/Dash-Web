import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { computed } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { Doc, Opt } from '../../../fields/Doc';
import { collectionSchema, documentSchema } from '../../../fields/documentSchemas';
import { makeInterface } from '../../../fields/Schema';
import { NumCast, ScriptCast, StrCast } from '../../../fields/Types';
import { OmitKeys, returnFalse } from '../../../Utils';
import { DragManager } from '../../util/DragManager';
import { DocumentView, DocumentViewProps } from '../nodes/DocumentView';
import { FormattedTextBox } from '../nodes/formattedText/FormattedTextBox';
import { StyleProp } from '../StyleProvider';
import "./CollectionCarouselView.scss";
import { CollectionSubView, SubCollectionViewProps } from './CollectionSubView';

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
    captionStyleProvider = (doc: (Doc | undefined), props: Opt<DocumentViewProps>, property: string): any => {
        const captionProps = { ...this.props, fieldKey: "caption" };
        return this.props.styleProvider?.(doc, props, property) || this.props.styleProvider?.(this.layoutDoc, captionProps, property);
    }
    panelHeight = () => this.props.PanelHeight() - (StrCast(this.layoutDoc._showCaption) ? 50 : 0);
    onContentDoubleClick = () => ScriptCast(this.layoutDoc.onChildDoubleClick);
    onContentClick = () => ScriptCast(this.layoutDoc.onChildClick);
    @computed get content() {
        const index = NumCast(this.layoutDoc._itemIndex);
        const curDoc = this.childLayoutPairs?.[index];
        const captionProps = { ...this.props, fieldKey: "caption" };
        const marginX = NumCast(this.layoutDoc["caption-xMargin"]);
        const marginY = NumCast(this.layoutDoc["caption-yMargin"]);
        return !(curDoc?.layout instanceof Doc) ? (null) :
            <>
                <div className="collectionCarouselView-image" key="image">
                    <DocumentView  {...OmitKeys(this.props, ["NativeWidth", "NativeHeight", "childLayoutTemplate", "childLayoutString"]).omit}
                        onDoubleClick={this.onContentDoubleClick}
                        onClick={this.onContentClick}
                        renderDepth={this.props.renderDepth + 1}
                        ContainingCollectionView={this}
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
                        display: StrCast(this.layoutDoc._showCaption) ? undefined : "none",
                        borderRadius: this.props.styleProvider?.(this.layoutDoc, captionProps, StyleProp.BorderRounding),
                        marginRight: marginX, marginLeft: marginX,
                        width: `calc(100% - ${marginX * 2}px)`
                    }}>
                    <FormattedTextBox key={index} {...captionProps}
                        styleProvider={this.captionStyleProvider}
                        Document={curDoc.layout} DataDoc={undefined}
                        fontSize={NumCast(this.layoutDoc["caption-fontSize"])}
                        xPadding={NumCast(this.layoutDoc["caption-xPadding"])}
                        yPadding={NumCast(this.layoutDoc["caption-yPadding"])} />
                </div>
            </>;
    }
    @computed get buttons() {
        return <>
            <div key="back" className="carouselView-back" onClick={this.goback}>
                <FontAwesomeIcon icon={"chevron-left"} size={"2x"} />
            </div>
            <div key="fwd" className="carouselView-fwd" onClick={this.advance}>
                <FontAwesomeIcon icon={"chevron-right"} size={"2x"} />
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