import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action } from 'mobx';
// import "./SearchBox.scss";
import "./IconBar.scss";
import "./IconButton.scss";
import { faSearch, faFilePdf, faFilm, faImage, faObjectGroup, faStickyNote, faMusic, faLink, faChartBar, faGlobeAsia, faBan, faTimesCircle, faCheckCircle } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { library } from '@fortawesome/fontawesome-svg-core';
import * as _ from "lodash";
import { IconButton } from './IconButton';
import { DocumentType } from "../../documents/DocumentTypes";


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

export interface IconBarProps {
    setIcons: (icons: string[]) => void;
}


@observer
export class IconBar extends React.Component<IconBarProps> {
    public _allIcons: string[] = [DocumentType.AUDIO, DocumentType.COL, DocumentType.IMG, DocumentType.LINK, DocumentType.PDF, DocumentType.RTF, DocumentType.VID, DocumentType.WEB];

    @observable private _icons: string[] = this._allIcons;

    static Instance: IconBar;

    @observable public _resetClicked: boolean = false;
    @observable public _selectAllClicked: boolean = false;
    @observable public _reset: number = 0;
    @observable public _select: number = 0;

    @action.bound
    updateIcon(newArray: string[]) {
        this._icons = newArray;
        this.props.setIcons?.(this._icons);
    }

    @action.bound
    getIcons(): string[] { return this._icons; }

    constructor(props: any) {
        super(props);
        IconBar.Instance = this;
    }

    @action.bound
    getList(): string[] { return this.getIcons(); }

    @action.bound
    updateList(newList: string[]) { this.updateIcon(newList); }

    @action.bound
    resetSelf = () => {
        this._resetClicked = true;
        this.updateList([]);
    }

    @action.bound
    selectAll = () => {
        this._selectAllClicked = true;
        this.updateList(this._allIcons);
    }

    render() {
        return (
            <div className="icon-bar">
                {this._allIcons.map((type: string) =>
                    <IconButton key={type.toString()} type={type} />
                )}
            </div>
        );
    }
}
