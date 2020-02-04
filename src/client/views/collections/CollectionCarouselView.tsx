import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { observable, computed } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { documentSchema } from '../../../new_fields/documentSchemas';
import { makeInterface } from '../../../new_fields/Schema';
import { NumCast, StrCast } from '../../../new_fields/Types';
import { DragManager } from '../../util/DragManager';
import { ContentFittingDocumentView } from '../nodes/ContentFittingDocumentView';
import "./CollectionCarouselView.scss";
import { CollectionSubView } from './CollectionSubView';
import { faCaretLeft, faCaretRight } from '@fortawesome/free-solid-svg-icons';
import { Doc } from '../../../new_fields/Doc';
import { FormattedTextBox } from '../nodes/FormattedTextBox';




type CarouselDocument = makeInterface<[typeof documentSchema,]>;
const CarouselDocument = makeInterface(documentSchema);

@observer
export class CollectionCarouselView extends CollectionSubView(CarouselDocument) {
    @observable public addMenuToggle = React.createRef<HTMLInputElement>();
    private _dropDisposer?: DragManager.DragDropDisposer;

    componentWillUnmount() {
        this._dropDisposer && this._dropDisposer();
    }

    componentDidMount() {
    }
    protected createDashEventsTarget = (ele: HTMLDivElement) => { //used for stacking and masonry view
        this._dropDisposer && this._dropDisposer();
        if (ele) {
            this._dropDisposer = DragManager.MakeDropTarget(ele, this.drop.bind(this));
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
    @computed get content() {
        const index = NumCast(this.layoutDoc._itemIndex);
        return !(this.childLayoutPairs?.[index]?.layout instanceof Doc) ? (null) :
            <div>
                <div className="collectionCarouselView-image">
                    <ContentFittingDocumentView {...this.props}
                        Document={this.childLayoutPairs[index].layout}
                        DataDocument={this.childLayoutPairs[index].data}
                        PanelHeight={this.panelHeight}
                        getTransform={this.props.ScreenToLocalTransform} />
                </div>
                <div className="collectionCarouselView-caption" style={{ background: `${StrCast(this.props.Document.backgroundColor)}` }}>
                    <FormattedTextBox key={index} {...this.props} Document={this.childLayoutPairs[index].layout} DataDoc={undefined} fieldKey={"caption"}></FormattedTextBox>
                </div>
            </div>
    }
    @computed get buttons() {
        return <>
            <div key="back" className="carouselView-back" style={{ background: `${StrCast(this.props.Document.backgroundColor)}` }} onClick={this.goback}>
                <FontAwesomeIcon icon={faCaretLeft} size={"2x"} />
            </div>
            <div key="fwd" className="carouselView-fwd" style={{ background: `${StrCast(this.props.Document.backgroundColor)}` }} onClick={this.advance}>
                <FontAwesomeIcon icon={faCaretRight} size={"2x"} />
            </div>
        </>;
    }
    render() {
        return <div className="collectionCarouselView-outer" ref={this.createDashEventsTarget}>
            {this.content}
            {this.buttons}
        </div>;
    }
}