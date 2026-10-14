import { SetMetadata } from '@nestjs/common';

const Public = () => SetMetadata('speckvue.public', true);

export default Public;
