import * as React from "react";
import { observable, action } from "mobx";
import { SelectionManager } from "./SelectionManager";
import MainViewModal from "../views/MainViewModal";
import { observer } from "mobx-react";
import { Doc, DocListCast } from "../../fields/Doc";
import { List } from "../../fields/List";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as fa from '@fortawesome/free-solid-svg-icons';
import { library } from "@fortawesome/fontawesome-svg-core";

library.add(fa.faWindowClose);

@observer
export default class GroupManager extends React.Component<{}> {

    static Instance: GroupManager;
    @observable private isOpen: boolean = false; // whether the menu is open or not
    @observable private dialogueBoxOpacity: number = 1;
    @observable private overlayOpacity: number = 0.4;

    constructor(props: Readonly<{}>) {
        super(props);
        GroupManager.Instance = this;
    }

    open = action(() => {
        SelectionManager.DeselectAll();
        this.isOpen = true;
    });

    close = action(() => {
        this.isOpen = false;
    });

    get GroupManagerDoc(): Doc | undefined {
        return Doc.UserDoc().globalGroupDatabase as Doc;
    }

    getAllGroups(): Doc[] {
        const groupDoc = GroupManager.Instance.GroupManagerDoc;
        return groupDoc ? DocListCast(groupDoc.data) : [];
    }

    addGroup(groupDoc: Doc): boolean {
        const groupList = GroupManager.Instance.getAllGroups();
        groupList.push(groupDoc);
        if (GroupManager.Instance.GroupManagerDoc) {
            GroupManager.Instance.GroupManagerDoc.data = new List<Doc>(groupList);
            return true;
        }
        return false;
    }

    deleteGroup(groupDoc: Doc): boolean {
        const groupList = GroupManager.Instance.getAllGroups();
        const index = groupList.indexOf(groupDoc);
        if (index !== -1) {
            groupList.splice(index, 1);
            if (GroupManager.Instance.GroupManagerDoc) {
                GroupManager.Instance.GroupManagerDoc.data = new List<Doc>(groupList);
                return true;
            }
        }
        return false;
    }

    private get groupInterface() {
        return (
            <div className="settings-interface">
                <div className="settings-heading">
                    <h1>Groups</h1>
                    <div className={"close-button"} onClick={this.close}>
                        <FontAwesomeIcon icon={fa.faWindowClose} size={"lg"} />
                    </div>
                </div>
                <div className="settings-body">
                    <div className="settings-type">
                        <button value="password">reset password</button>
                        <button value="data">{`toggle novice mode`}</button>
                    </div>
                </div>
            </div>
        );
    }

    render() {
        return (
            <MainViewModal
                contents={this.groupInterface}
                isDisplayed={this.isOpen}
                interactive={true}
                dialogueBoxDisplayedOpacity={this.dialogueBoxOpacity}
                overlayDisplayedOpacity={this.overlayOpacity}
            />
        );
    }

}