import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import * as _ from "lodash";
import { action, IReactionDisposer, observable, reaction, runInAction } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { DocumentType } from "../../documents/DocumentTypes";
import '../globalCssVariables.scss';
import { IconBar } from './IconBar';
import "./IconButton.scss";
import "./SearchBox.scss";
import { Font } from '@react-pdf/renderer';

interface IconButtonProps {
    type: string;
}

@observer
export class IconButton extends React.Component<IconButtonProps>{

    @observable private _isSelected: boolean = IconBar.Instance.getIcons().indexOf(this.props.type) !== -1;
    @observable private _hover = false;
    private _resetReaction?: IReactionDisposer;
    private _selectAllReaction?: IReactionDisposer;

    static Instance: IconButton;
    constructor(props: IconButtonProps) {
        super(props);
        IconButton.Instance = this;
    }

    componentDidMount = () => {
        this._resetReaction = reaction(
            () => IconBar.Instance._resetClicked,
            action(() => {
                if (IconBar.Instance._resetClicked) {
                    this._isSelected = false;
                    IconBar.Instance._reset++;
                    if (IconBar.Instance._reset === 9) {
                        IconBar.Instance._reset = 0;
                        IconBar.Instance._resetClicked = false;
                    }
                }
            }),
        );

        this._selectAllReaction = reaction(
            () => IconBar.Instance._selectAllClicked,
            action(() => {
                if (IconBar.Instance._selectAllClicked) {
                    this._isSelected = true;
                    IconBar.Instance._select++;
                    if (IconBar.Instance._select === 9) {
                        IconBar.Instance._select = 0;
                        IconBar.Instance._selectAllClicked = false;
                    }
                }
            }),
        );
    }

    @action.bound
    getIcon() {
        switch (this.props.type) {
            case (DocumentType.NONE): return "ban";
            case (DocumentType.AUDIO): return "music";
            case (DocumentType.COL): return "object-group";
            case (DocumentType.IMG): return "image";
            case (DocumentType.LINK): return "link";
            case (DocumentType.PDF): return "file-pdf";
            case (DocumentType.RTF): return "sticky-note";
            case (DocumentType.VID): return "video";
            case (DocumentType.WEB): return "globe-asia";
            default: return "caret-down";
        }
    }

    @action.bound
    onClick = () => {
        const newList: string[] = IconBar.Instance.getIcons();

        if (!this._isSelected) {
            this._isSelected = true;
            newList.push(this.props.type);
        }
        else {
            this._isSelected = false;
            _.pull(newList, this.props.type);
        }

        IconBar.Instance.updateIcon(newList);
    }

    selected = {
        opacity: 1,
        backgroundColor: "#121721",
        //backgroundColor: "rgb(128, 128, 128)"
    };

    notSelected = {
        opacity: 0.2,
        backgroundColor: "#121721",
    };

    hoverStyle = {
        opacity: 1,
        backgroundColor: "rgb(128, 128, 128)"
        //backgroundColor: "rgb(178, 206, 248)" //$darker-alt-accent
    };

    render() {
        return (
            <div className="type-outer" id={this.props.type + "-filter"}
                onMouseEnter={() => this._hover = true}
                onMouseLeave={() => this._hover = false}
                onClick={this.onClick}>
                <div className="type-icon" id={this.props.type + "-icon"}
                    style={this._hover ? this.hoverStyle : this._isSelected ? this.selected : this.notSelected}
                >
                    <FontAwesomeIcon className="fontawesome-icon" icon={this.getIcon()} />
                </div>
                {/* <div className="filter-description">{this.props.type}</div> */}
            </div>
        );
    }
}