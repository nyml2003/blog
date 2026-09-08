import { definePage } from "../../../solid/page";
import { CategoryShelfPage } from "../components/category-shelf-page";
import "../../styles/app.css";

const App = () => <CategoryShelfPage title="全部文章" />;

definePage(App);
