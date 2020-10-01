import { action, observable } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { DocumentType } from "../../documents/DocumentTypes";
// import "./SearchBox.scss";
import "./IconBar.scss";
import { IconButton } from './IconButton';
import "./IconButton.scss";

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
