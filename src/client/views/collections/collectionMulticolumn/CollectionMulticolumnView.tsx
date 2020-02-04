import { action, computed } from 'mobx';
import { observer } from 'mobx-react';
import * as React from "react";
import { Doc } from '../../../../new_fields/Doc';
import { documentSchema } from '../../../../new_fields/documentSchemas';
import { makeInterface } from '../../../../new_fields/Schema';
import { BoolCast, NumCast, ScriptCast, StrCast } from '../../../../new_fields/Types';
import { Utils } from '../../../../Utils';
import { DragManager } from '../../../util/DragManager';
import { Transform } from '../../../util/Transform';
import { undoBatch } from '../../../util/UndoManager';
import { ContentFittingDocumentView } from '../../nodes/ContentFittingDocumentView';
import { CollectionSubView } from '../CollectionSubView';
import "./collectionMulticolumnView.scss";
import ResizeBar from './MulticolumnResizer';
import WidthLabel from './MulticolumnWidthLabel';

type MulticolumnDocument = makeInterface<[typeof documentSchema]>;
const MulticolumnDocument = makeInterface(documentSchema);

interface WidthSpecifier {
    magnitude: number;
    unit: string;
}

interface LayoutData {
    widthSpecifiers: WidthSpecifier[];
    starSum: number;
}

export const DimUnit = {
    Pixel: "px",
    Ratio: "*"
};

const resolvedUnits = Object.values(DimUnit);
const resizerWidth = 4;

@observer
export class CollectionMulticolumnView extends CollectionSubView(MulticolumnDocument) {

    /**
     * @returns the list of layout documents whose width unit is
     * *, denoting that it will be displayed with a ratio, not fixed pixel, value
     */
    @computed
    private get ratioDefinedDocs() {
        return this.childLayoutPairs.map(pair => pair.layout).filter(layout => StrCast(layout.dimUnit, "*") === DimUnit.Ratio);
    }

    /**
     * This loops through all childLayoutPairs and extracts the values for dimUnit
     * and dimMagnitude, ignoring any that are malformed. Additionally, it then
     * normalizes the ratio values so that one * value is always 1, with the remaining
     * values proportionate to that easily readable metric.
     * @returns the list of the resolved width specifiers (unit and magnitude pairs)
     * as well as the sum of the * coefficients, i.e. the ratio magnitudes
     */
    @computed
    private get resolvedLayoutInformation(): LayoutData {
        let starSum = 0;
        const widthSpecifiers: WidthSpecifier[] = [];
        this.childLayoutPairs.map(pair => {
            const unit = StrCast(pair.layout.dimUnit, "*");
            const magnitude = NumCast(pair.layout.dimMagnitude, 1);
            if (unit && magnitude && magnitude > 0 && resolvedUnits.includes(unit)) {
                (unit === DimUnit.Ratio) && (starSum += magnitude);
                widthSpecifiers.push({ magnitude, unit });
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
                const minimum = Math.min(...ratioDefinedDocs.map(doc => NumCast(doc.dimMagnitude, 1)));
                if (minimum !== 0) {
                    ratioDefinedDocs.forEach(layout => layout.dimMagnitude = NumCast(layout.dimMagnitude, 1) / minimum, 1);
                }
            }
        });

        return { widthSpecifiers, starSum };
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
        return this.resolvedLayoutInformation?.widthSpecifiers.reduce(
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
        const layoutInfoLen = this.resolvedLayoutInformation.widthSpecifiers.length;
        if (layoutInfoLen > 0 && this.totalFixedAllocation !== undefined) {
            return this.props.PanelWidth() - (this.totalFixedAllocation + resizerWidth * (layoutInfoLen - 1));
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
    private get columnUnitLength(): number | undefined {
        if (this.resolvedLayoutInformation && this.totalRatioAllocation !== undefined) {
            return this.totalRatioAllocation / this.resolvedLayoutInformation.starSum;
        }
    }

    /**
     * This wrapper function exists to prevent mobx from
     * needlessly rerendering the internal ContentFittingDocumentViews
     */
    private getColumnUnitLength = () => this.columnUnitLength;

    /**
     * @param layout the document whose transform we'd like to compute
     * Given a layout document, this function
     * returns the resolved width it has requested, in pixels.
     * @returns the stored column width if already in pixels,
     * or the ratio width evaluated to a pixel value
     */
    private lookupPixels = (layout: Doc): number => {
        const columnUnitLength = this.columnUnitLength;
        if (columnUnitLength === undefined) {
            return 0; // we're still waiting on promises to resolve
        }
        let width = NumCast(layout.dimMagnitude, 1);
        if (StrCast(layout.dimUnit, "*") === DimUnit.Ratio) {
            width *= columnUnitLength;
        }
        return width;
    }

    /**
     * @returns the transform that will correctly place
     * the document decorations box, shifted to the right by
     * the sum of all the resolved column widths of the
     * documents before the target. 
     */
    private lookupIndividualTransform = (layout: Doc) => {
        const columnUnitLength = this.columnUnitLength;
        if (columnUnitLength === undefined) {
            return Transform.Identity(); // we're still waiting on promises to resolve
        }
        let offset = 0;
        for (const { layout: candidate } of this.childLayoutPairs) {
            if (candidate === layout) {
                return this.props.ScreenToLocalTransform().translate(-offset, 0);
            }
            offset += this.lookupPixels(candidate) + resizerWidth;
        }
        return Transform.Identity(); // type coersion, this case should never be hit
    }

    @undoBatch
    @action
    drop = (e: Event, de: DragManager.DropEvent) => {
        if (super.drop(e, de)) {
            de.complete.docDragData?.droppedDocuments.forEach(action((d: Doc) => {
                d.dimUnit = "*";
                d.dimMagnitude = 1;
            }));
        }
        return false;
    }


    @computed get onChildClickHandler() { return ScriptCast(this.Document.onChildClick); }

    /**
     * @returns the resolved list of rendered child documents, displayed
     * at their resolved pixel widths, each separated by a resizer. 
     */
    @computed
    private get contents(): JSX.Element[] | null {
        const { childLayoutPairs } = this;
        const { Document, PanelHeight } = this.props;
        const collector: JSX.Element[] = [];
        for (let i = 0; i < childLayoutPairs.length; i++) {
            const { layout } = childLayoutPairs[i];
            collector.push(
                <div
                    className={"document-wrapper"}
                    key={Utils.GenerateGuid()}
                >
                    <ContentFittingDocumentView
                        {...this.props}
                        Document={layout}
                        DataDocument={layout.resolvedDataDoc as Doc}
                        CollectionDoc={this.props.Document}
                        PanelWidth={() => this.lookupPixels(layout)}
                        PanelHeight={() => PanelHeight() - (BoolCast(Document.showWidthLabels) ? 20 : 0)}
                        getTransform={() => this.lookupIndividualTransform(layout)}
                        onClick={this.onChildClickHandler}
                    />
                    <WidthLabel
                        layout={layout}
                        collectionDoc={Document}
                    />
                </div>,
                <ResizeBar
                    width={resizerWidth}
                    key={Utils.GenerateGuid()}
                    columnUnitLength={this.getColumnUnitLength}
                    toLeft={layout}
                    toRight={childLayoutPairs[i + 1]?.layout}
                />
            );
        }
        collector.pop(); // removes the final extraneous resize bar
        return collector;
    }

    render(): JSX.Element {
        return (
            <div className={"collectionMulticolumnView_contents"} ref={this.createDashEventsTarget}>
                {this.contents}
            </div>
        );
    }

}