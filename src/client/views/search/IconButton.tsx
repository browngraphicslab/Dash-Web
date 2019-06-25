import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action, runInAction, IReactionDisposer, reaction } from 'mobx';
import "./SearchBox.scss";
import "./IconButton.scss";
import { faSearch, faFilePdf, faFilm, faImage, faObjectGroup, faStickyNote, faMusic, faLink, faChartBar, faGlobeAsia, faBan, faVideo, faCaretDown } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { library, icon } from '@fortawesome/fontawesome-svg-core';
import { DocTypes } from '../../documents/Documents';
import '../globalCssVariables.scss';
import * as _ from "lodash";
import { IconBar } from './IconBar';
import { props } from 'bluebird';
import { SearchBox } from './SearchBox';
import { Search } from '../../../server/Search';

library.add(faSearch);
library.add(faObjectGroup);
library.add(faImage);
library.add(faStickyNote);
library.add(faFilePdf);
library.add(faFilm);
library.add(faMusic);
library.add(faLink);
library.add(faChartBar);
library.add(faGlobeAsia);
library.add(faBan);

interface IconButtonProps {
    type: string;
}

@observer
export class IconButton extends React.Component<IconButtonProps>{

    @observable private _isSelected: boolean = SearchBox.Instance.getIcons().indexOf(this.props.type) !== -1;
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
            () => {
                if (IconBar.Instance._resetClicked) {
                    runInAction(() => {
                        this.reset();
                        IconBar.Instance._reset++;
                        if (IconBar.Instance._reset === 9) {
                            IconBar.Instance._reset = 0;
                            IconBar.Instance._resetClicked = false;
                        }
                    });
                }
            },
        );
        this._selectAllReaction = reaction(
            () => IconBar.Instance._selectAllClicked,
            () => {
                if (IconBar.Instance._selectAllClicked) {
                    runInAction(() => {
                        this.select();
                        IconBar.Instance._select++;
                        if (IconBar.Instance._select === 9) {
                            IconBar.Instance._select = 0;
                            IconBar.Instance._selectAllClicked = false;
                        }
                    });
                }
            },
        );
    }

    @action.bound
    getIcon() {
        switch (this.props.type) {
            case (DocTypes.NONE):
                return faBan;
            case (DocTypes.AUDIO):
                return faMusic;
            case (DocTypes.COL):
                return faObjectGroup;
            case (DocTypes.HIST):
                return faChartBar;
            case (DocTypes.IMG):
                return faImage;
            case (DocTypes.LINK):
                return faLink;
            case (DocTypes.PDF):
                return faFilePdf;
            case (DocTypes.TEXT):
                return faStickyNote;
            case (DocTypes.VID):
                return faVideo;
            case (DocTypes.WEB):
                return faGlobeAsia;
            default:
                return faCaretDown;
        }
    }

    @action.bound
    onClick = () => {
        let newList: string[] = SearchBox.Instance.getIcons();

        if (!this._isSelected) {
            this._isSelected = true;
            newList.push(this.props.type);
        }
        else {
            this._isSelected = false;
            _.pull(newList, this.props.type);
        }

        SearchBox.Instance.updateIcon(newList);
    }

    selected = {
        opacity: 1,
        backgroundColor: "#c2c2c5" //$alt-accent
    };

    notSelected = {
        opacity: 0.6,
    };

    hoverStyle = {
        opacity: 1,
        backgroundColor: "rgb(178, 206, 248)" //$darker-alt-accent
    };

    @action.bound
    public reset() { this._isSelected = false; }

    @action.bound
    public select() { this._isSelected = true; }

    @action
    onMouseLeave = () => { this._hover = false; }

    @action
    onMouseEnter = () => { this._hover = true; }

    getFA = () => {
        switch (this.props.type) {
            case (DocTypes.NONE):
                return (<FontAwesomeIcon className="fontawesome-icon" icon={faBan} />);
            case (DocTypes.AUDIO):
                return (<FontAwesomeIcon className="fontawesome-icon" icon={faMusic} />);
            case (DocTypes.COL):
                return (<FontAwesomeIcon className="fontawesome-icon" icon={faObjectGroup} />);
            case (DocTypes.HIST):
                return (<FontAwesomeIcon className="fontawesome-icon" icon={faChartBar} />);
            case (DocTypes.IMG):
                return (<FontAwesomeIcon className="fontawesome-icon" icon={faImage} />);
            case (DocTypes.LINK):
                return (<FontAwesomeIcon className="fontawesome-icon" icon={faLink} />);
            case (DocTypes.PDF):
                return (<FontAwesomeIcon className="fontawesome-icon" icon={faFilePdf} />);
            case (DocTypes.TEXT):
                return (<FontAwesomeIcon className="fontawesome-icon" icon={faStickyNote} />);
            case (DocTypes.VID):
                return (<FontAwesomeIcon className="fontawesome-icon" icon={faVideo} />);
            case (DocTypes.WEB):
                return (<FontAwesomeIcon className="fontawesome-icon" icon={faGlobeAsia} />);
            default:
                return (<FontAwesomeIcon className="fontawesome-icon" icon={faCaretDown} />);
        }
    }

    render() {
        return (
            <div className="type-outer" id={this.props.type + "-filter"}
                onMouseEnter={this.onMouseEnter}
                onMouseLeave={this.onMouseLeave}
                onClick={this.onClick}>
                <div className="type-icon" id={this.props.type + "-icon"}
                    style={this._hover ? this.hoverStyle : this._isSelected ? this.selected : this.notSelected}
                >
                    {this.getFA()}
                </div>
                <div className="filter-description">{this.props.type}</div>
            </div>
        );
    }
}