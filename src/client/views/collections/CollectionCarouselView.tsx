import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { observable } from 'mobx';
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

    render() {
        const index = NumCast(this.layoutDoc._itemIndex);
        return !(this.childLayoutPairs?.[index]?.layout instanceof Doc) ? (null) :
            <div className="collectionCarouselView-outer">
                <ContentFittingDocumentView
                    {...this.props}
                    Document={this.childLayoutPairs[index].layout}
                    DataDocument={this.childLayoutPairs[index].data}
                    getTransform={this.props.ScreenToLocalTransform} />
                <div className="carouselView-back" onClick={() => this.layoutDoc._itemIndex = (index - 1 + this.childLayoutPairs.length) % this.childLayoutPairs.length}>
                    <FontAwesomeIcon
                        icon={faCaretLeft}
                        size={"2x"}
                    />
                </div>
                <div className="carouselView-fwd" onClick={() => this.layoutDoc._itemIndex = (index + 1) % this.childLayoutPairs.length}>
                    <FontAwesomeIcon
                        icon={faCaretRight}
                        size={"2x"}
                    />
                </div>
            </div>;
    }
}