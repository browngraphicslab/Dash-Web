import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { observable, computed } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { documentSchema } from '../../../new_fields/documentSchemas';
import { makeInterface } from '../../../new_fields/Schema';
import { NumCast } from '../../../new_fields/Types';
import { DragManager } from '../../util/DragManager';
import { ContentFittingDocumentView } from '../nodes/ContentFittingDocumentView';
import "./CollectionCarouselView.scss";
import { CollectionSubView } from './CollectionSubView';
import { faCaretLeft, faCaretRight } from '@fortawesome/free-solid-svg-icons';
import { Doc } from '../../../new_fields/Doc';




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

    @computed get content() {
        const index = NumCast(this.layoutDoc._itemIndex);
        return !(this.childLayoutPairs?.[index]?.layout instanceof Doc) ? (null) :
            <ContentFittingDocumentView {...this.props}
                Document={this.childLayoutPairs[index].layout}
                DataDocument={this.childLayoutPairs[index].data}
                getTransform={this.props.ScreenToLocalTransform} />
    }
    @computed get buttons() {
        return <>
            <div key="back" className="carouselView-back" onClick={this.goback}>
                <FontAwesomeIcon icon={faCaretLeft} size={"2x"} />
            </div>
            <div key="fwd" className="carouselView-fwd" onClick={this.advance}>
                <FontAwesomeIcon icon={faCaretRight} size={"2x"} />
            </div>
        </>;
    }
    render() {
        return <div className="collectionCarouselView-outer">
            {this.content}
            {this.buttons}
        </div>;
    }
}