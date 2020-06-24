import { observer } from 'mobx-react';
import { makeInterface } from '../../../../fields/Schema';
import { documentSchema } from '../../../../fields/documentSchemas';
import { CollectionSubView, SubCollectionViewProps } from '../CollectionSubView';
import * as React from "react";
import { Doc } from '../../../../fields/Doc';
import { NumCast, StrCast, BoolCast, ScriptCast } from '../../../../fields/Types';
import { ContentFittingDocumentView } from '../../nodes/ContentFittingDocumentView';
import { Utils, returnZero, returnFalse, returnOne } from '../../../../Utils';
import "./collectionMultirowView.scss";
import { computed, trace, observable, action } from 'mobx';
import { Transform } from '../../../util/Transform';
import HeightLabel from './MultirowHeightLabel';
import ResizeBar from './MultirowResizer';
import { undoBatch } from '../../../util/UndoManager';
import { DragManager, dropActionType } from '../../../util/DragManager';
import { List } from '../../../../fields/List';

type MultirowDocument = makeInterface<[typeof documentSchema]>;
const MultirowDocument = makeInterface(documentSchema);

interface HeightSpecifier {
    magnitude: number;
    unit: string;
}

interface LayoutData {
    heightSpecifiers: HeightSpecifier[];
    starSum: number;
}

export const DimUnit = {
    Pixel: "px",
    Ratio: "*"
};

const resolvedUnits = Object.values(DimUnit);
const resizerHeight = 8;

@observer
export class CollectionMultirowView extends CollectionSubView(MultirowDocument) {

    /**
     * @returns the list of layout documents whose width unit is
     * *, denoting that it will be displayed with a ratio, not fixed pixel, value
     */
    @computed
    private get ratioDefinedDocs() {
        return this.childLayoutPairs.map(pair => pair.layout).filter(layout => StrCast(layout._dimUnit, "*") === DimUnit.Ratio);
    }

    /**
     * This loops through all childLayoutPairs and extracts the values for _dimUnit
     * and _dimUnit, ignoring any that are malformed. Additionally, it then
     * normalizes the ratio values so that one * value is always 1, with the remaining
     * values proportionate to that easily readable metric.
     * @returns the list of the resolved width specifiers (unit and magnitude pairs)
     * as well as the sum of the * coefficients, i.e. the ratio magnitudes
     */
    @computed
    private get resolvedLayoutInformation(): LayoutData {
        let starSum = 0;
        const heightSpecifiers: HeightSpecifier[] = [];
        this.childLayoutPairs.map(pair => {
            const unit = StrCast(pair.layout._dimUnit, "*");
            const magnitude = NumCast(pair.layout._dimMagnitude, 1);
            if (unit && magnitude && magnitude > 0 && resolvedUnits.includes(unit)) {
                (unit === DimUnit.Ratio) && (starSum += magnitude);
                heightSpecifiers.push({ magnitude, unit });
            }
            /**
             * Otherwise, the child document is ignored and the remaining
             * space is allocated as if the document were absent from the child list
             */
        });

        /**
         * Here, since these values are all relative, adjustments during resizing or
         * manual updating can, though their ratios remain the same, cause the values
         * themselves to drift toward zero. Thus, whenever we change any of the values,
         * we normalize everything (dividing by the smallest magnitude).
         */
        setTimeout(() => {
            const { ratioDefinedDocs } = this;
            if (this.childLayoutPairs.length) {
                const minimum = Math.min(...ratioDefinedDocs.map(layout => NumCast(layout._dimMagnitude, 1)));
                if (minimum !== 0) {
                    ratioDefinedDocs.forEach(layout => layout._dimMagnitude = NumCast(layout._dimMagnitude, 1) / minimum);
                }
            }
        });

        return { heightSpecifiers, starSum };
    }

    /**
     * This returns the total quantity, in pixels, that this
     * view needs to reserve for child documents that have
     * (with higher priority) requested a fixed pixel width.
     * 
     * If the underlying resolvedLayoutInformation returns null
     * because we're waiting on promises to resolve, this value will be undefined as well.
     */
    @computed
    private get totalFixedAllocation(): number | undefined {
        return this.resolvedLayoutInformation?.heightSpecifiers.reduce(
            (sum, { magnitude, unit }) => sum + (unit === DimUnit.Pixel ? magnitude : 0), 0);
    }

    /**
     * @returns the total quantity, in pixels, that this
     * view needs to reserve for child documents that have
     * (with lower priority) requested a certain relative proportion of the
     * remaining pixel width not allocated for fixed widths.
     * 
     * If the underlying totalFixedAllocation returns undefined
     * because we're waiting indirectly on promises to resolve, this value will be undefined as well.
     */
    @computed
    private get totalRatioAllocation(): number | undefined {
        const layoutInfoLen = this.resolvedLayoutInformation.heightSpecifiers.length;
        if (layoutInfoLen > 0 && this.totalFixedAllocation !== undefined) {
            return this.props.PanelHeight() - (this.totalFixedAllocation + resizerHeight * (layoutInfoLen - 1)) - 2 * NumCast(this.props.Document._yMargin);
        }
    }

    /**
     * @returns the total quantity, in pixels, that
     * 1* (relative / star unit) is worth. For example,
     * if the configuration has three documents, with, respectively,
     * widths of 2*, 2* and 1*, and the panel width returns 1000px,
     * this accessor returns 1000 / (2 + 2 + 1), or 200px.
     * Elsewhere, this is then multiplied by each relative-width
     * document's (potentially decimal) * count to compute its actual width (400px, 400px and 200px).
     * 
     * If the underlying totalRatioAllocation or this.resolveLayoutInformation return undefined
     * because we're waiting indirectly on promises to resolve, this value will be undefined as well.
     */
    @computed
    private get rowUnitLength(): number | undefined {
        if (this.resolvedLayoutInformation && this.totalRatioAllocation !== undefined) {
            return this.totalRatioAllocation / this.resolvedLayoutInformation.starSum;
        }
    }

    /**
     * This wrapper function exists to prevent mobx from
     * needlessly rerendering the internal ContentFittingDocumentViews
     */
    private getRowUnitLength = () => this.rowUnitLength;

    /**
     * @param layout the document whose transform we'd like to compute
     * Given a layout document, this function
     * returns the resolved width it has requested, in pixels.
     * @returns the stored row width if already in pixels,
     * or the ratio width evaluated to a pixel value
     */
    private lookupPixels = (layout: Doc): number => {
        const rowUnitLength = this.rowUnitLength;
        if (rowUnitLength === undefined) {
            return 0; // we're still waiting on promises to resolve
        }
        let height = NumCast(layout._dimMagnitude, 1);
        if (StrCast(layout._dimUnit, "*") === DimUnit.Ratio) {
            height *= rowUnitLength;
        }
        return height;
    }

    /**
     * @returns the transform that will correctly place
     * the document decorations box, shifted to the right by
     * the sum of all the resolved row widths of the
     * documents before the target. 
     */
    private lookupIndividualTransform = (layout: Doc) => {
        const rowUnitLength = this.rowUnitLength;
        if (rowUnitLength === undefined) {
            return Transform.Identity(); // we're still waiting on promises to resolve
        }
        let offset = 0;
        for (const { layout: candidate } of this.childLayoutPairs) {
            if (candidate === layout) {
                return this.props.ScreenToLocalTransform().translate(0, -offset);
            }
            offset += this.lookupPixels(candidate) + resizerHeight;
        }
        return Transform.Identity(); // type coersion, this case should never be hit
    }

    @undoBatch
    @action
    onInternalDrop = (e: Event, de: DragManager.DropEvent) => {
        if (super.onInternalDrop(e, de)) {
            de.complete.docDragData?.droppedDocuments.forEach(action((d: Doc) => {
                d._dimUnit = "*";
                d._dimMagnitude = 1;
            }));
        }
        return false;
    }


    @computed get onChildClickHandler() { return ScriptCast(this.Document.onChildClick); }
    @computed get onChildDoubleClickHandler() { return ScriptCast(this.Document.onChildDoubleClick); }

    addDocTab = (doc: Doc, where: string) => {
        if (where === "inPlace" && this.layoutDoc.isInPlaceContainer) {
            this.dataDoc[this.props.fieldKey] = new List<Doc>([doc]);
            return true;
        }
        return this.props.addDocTab(doc, where);
    }
    getDisplayDoc(layout: Doc, dxf: () => Transform, width: () => number, height: () => number) {
        return <ContentFittingDocumentView
            Document={layout}
            DataDoc={layout.resolvedDataDoc as Doc}
            backgroundColor={this.props.backgroundColor}
            LayoutTemplate={this.props.ChildLayoutTemplate}
            LayoutTemplateString={this.props.ChildLayoutString}
            LibraryPath={this.props.LibraryPath}
            FreezeDimensions={this.props.freezeChildDimensions}
            renderDepth={this.props.renderDepth + 1}
            PanelWidth={width}
            PanelHeight={height}
            NativeHeight={returnZero}
            NativeWidth={returnZero}
            fitToBox={false}
            rootSelected={this.rootSelected}
            dropAction={StrCast(this.props.Document.childDropAction) as dropActionType}
            onClick={this.onChildClickHandler}
            onDoubleClick={this.onChildDoubleClickHandler}
            ScreenToLocalTransform={dxf}
            focus={this.props.focus}
            docFilters={this.docFilters}
            ContainingCollectionDoc={this.props.CollectionView?.props.Document}
            ContainingCollectionView={this.props.CollectionView}
            addDocument={this.props.addDocument}
            moveDocument={this.props.moveDocument}
            removeDocument={this.props.removeDocument}
            parentActive={this.props.active}
            whenActiveChanged={this.props.whenActiveChanged}
            addDocTab={this.addDocTab}
            pinToPres={this.props.pinToPres}
            bringToFront={returnFalse}
            ContentScaling={returnOne}
        />;
    }
    /**
     * @returns the resolved list of rendered child documents, displayed
     * at their resolved pixel widths, each separated by a resizer. 
     */
    @computed
    private get contents(): JSX.Element[] | null {
        const { childLayoutPairs } = this;
        const { Document, PanelWidth } = this.props;
        const collector: JSX.Element[] = [];
        for (let i = 0; i < childLayoutPairs.length; i++) {
            const { layout } = childLayoutPairs[i];
            const dxf = () => this.lookupIndividualTransform(layout).translate(-NumCast(Document._xMargin), -NumCast(Document._yMargin));
            const height = () => this.lookupPixels(layout);
            const width = () => PanelWidth() - 2 * NumCast(Document._xMargin) - (BoolCast(Document.showWidthLabels) ? 20 : 0);
            collector.push(
                <div
                    className={"document-wrapper"}
                    key={"wrapper" + i}
                >
                    {this.getDisplayDoc(layout, dxf, width, height)}
                    <HeightLabel
                        layout={layout}
                        collectionDoc={Document}
                    />
                </div>,
                <ResizeBar
                    height={resizerHeight}
                    key={"resizer" + i}
                    columnUnitLength={this.getRowUnitLength}
                    toTop={layout}
                    toBottom={childLayoutPairs[i + 1]?.layout}
                />
            );
        }
        collector.pop(); // removes the final extraneous resize bar
        return collector;
    }

    render(): JSX.Element {
        return (
            <div className={"collectionMultirowView_contents"}
                style={{
                    width: `calc(100% - ${2 * NumCast(this.props.Document._xMargin)}px)`,
                    height: `calc(100% - ${2 * NumCast(this.props.Document._yMargin)}px)`,
                    marginLeft: NumCast(this.props.Document._xMargin), marginRight: NumCast(this.props.Document._xMargin),
                    marginTop: NumCast(this.props.Document._yMargin), marginBottom: NumCast(this.props.Document._yMargin)
                }} ref={this.createDashEventsTarget}>
                {this.contents}
            </div>
        );
    }

}