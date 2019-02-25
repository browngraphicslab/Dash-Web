
import Lightbox from 'react-image-lightbox';
import { SelectionManager } from "../../util/SelectionManager";
import "./WebBox.scss";
import React = require("react")
import { WebField } from '../../../fields/WebField';
import { FieldViewProps, FieldView } from './FieldView';
import { CollectionFreeFormDocumentView } from './CollectionFreeFormDocumentView';
import { FieldWaiting } from '../../../fields/Field';
import { observer } from "mobx-react"
import { observable, action, spy } from 'mobx';
import { KeyStore } from '../../../fields/KeyStore';

@observer
export class WebBox extends React.Component<FieldViewProps> {

    public static LayoutString() { return FieldView.LayoutString(WebBox); }
    private _ref: React.RefObject<HTMLDivElement>;
    private _downX: number = 0;
    private _downY: number = 0;
    private _lastTap: number = 0;
    @observable private _isOpen: boolean = false;

    constructor(props: FieldViewProps) {
        super(props);

        this._ref = React.createRef();
        this.state = {
            isOpen: false,
        };
    }

    componentDidMount() {
    }

    componentWillUnmount() {
    }

    onPointerDown = (e: React.PointerEvent): void => {
        if (Date.now() - this._lastTap < 300) {
            if (e.buttons === 1 && this.props.isSelected()) {
                e.stopPropagation();
                this._downX = e.clientX;
                this._downY = e.clientY;
                document.removeEventListener("pointerup", this.onPointerUp);
                document.addEventListener("pointerup", this.onPointerUp);
            }
        } else {
            this._lastTap = Date.now();
        }
    }

    @action
    onPointerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointerup", this.onPointerUp);
        if (Math.abs(e.clientX - this._downX) < 2 && Math.abs(e.clientY - this._downY) < 2) {
            this._isOpen = true;
        }
        e.stopPropagation();
    }

    render() {
        let field = this.props.doc.Get(this.props.fieldKey);
        let path = field == FieldWaiting ? "https://image.flaticon.com/icons/svg/66/66163.svg" :
            field instanceof WebField ? field.Data.href : "https://crossorigin.me/" + "https://cs.brown.edu";
        let nativeWidth = this.props.doc.GetNumber(KeyStore.NativeWidth, 1);

        return (
            <div className="webBox-cont" onPointerDown={this.onPointerDown} ref={this._ref}   >
                <iframe src={path} width={nativeWidth}></iframe>
            </div>)
    }
}